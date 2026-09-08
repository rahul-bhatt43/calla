"use client";

import {
  DIRECT_MAX_BITRATE_BPS,
  RELAY_MAX_BITRATE_BPS,
  decodeChatMessage,
  type ChatMessage,
  type IceServer,
  type SignalPayload,
} from "@callme/protocol";

export type CandidateType = "host" | "srflx" | "prflx" | "relay" | "unknown";

export interface PeerEvents {
  onRemoteStream: (stream: MediaStream) => void;
  onChat: (msg: ChatMessage) => void;
  /** Fires when the DataChannel opens and chat is genuinely usable. */
  onChatReady: () => void;
  onSignal: (payload: SignalPayload) => void;
  onStateChange: (state: RTCPeerConnectionState) => void;
  onCandidateType: (type: CandidateType) => void;
  onConnected: (setupMs: number) => void;
  onFailed: () => void;
}

/* -------------------------------------------------------------------------- */
/* Persistent local media                                                      */
/* -------------------------------------------------------------------------- */

let localStream: MediaStream | null = null;
let localStreamMode: "video" | "text" | null = null;

/**
 * The camera is acquired once and reused for every subsequent match.
 *
 * Calling getUserMedia per match costs roughly half a second and — worse —
 * makes the hardware camera light blink off and on at every "next". On a
 * product whose core loop is skipping through strangers, that flicker is the
 * single most noticeable piece of jank there is. Keeping one stream alive and
 * attaching its tracks to each new RTCPeerConnection removes it entirely.
 */
export async function acquireLocalStream(
  mode: "video" | "text",
): Promise<MediaStream | null> {
  if (mode === "text") return null;
  if (localStream && localStreamMode === mode && localStream.active) {
    return localStream;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
      facingMode: "user",
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  localStream = stream;
  localStreamMode = mode;
  return stream;
}

export function getLocalStream(): MediaStream | null {
  return localStream;
}

/** Only on leaving the chat entirely — never between matches. */
export function releaseLocalStream(): void {
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
  localStreamMode = null;
}

export function setTrackEnabled(kind: "audio" | "video", on: boolean): void {
  localStream?.getTracks().forEach((t) => {
    if (t.kind === kind) t.enabled = on;
  });
}

/* -------------------------------------------------------------------------- */
/* Peer session                                                                */
/* -------------------------------------------------------------------------- */

export class PeerSession {
  private pc: RTCPeerConnection;
  private chatChannel: RTCDataChannel;
  private fastChannel: RTCDataChannel;
  private events: PeerEvents;
  private polite: boolean;

  /** Perfect-negotiation bookkeeping. */
  private makingOffer = false;
  private ignoreOffer = false;
  private hasRemoteDescription = false;

  /** Candidates that arrive before the remote description is applied. */
  private pendingCandidates: RTCIceCandidateInit[] = [];

  /** Messages typed before the DataChannel finished opening. */
  private outbox: ChatMessage[] = [];

  private statsTimer: number | null = null;
  private startedAt = Date.now();
  private connectedAt: number | null = null;
  private candidateType: CandidateType = "unknown";
  private bitrateApplied = false;
  private closed = false;

  constructor(opts: {
    iceServers: IceServer[];
    polite: boolean;
    localStream: MediaStream | null;
    events: PeerEvents;
    forceRelay?: boolean;
  }) {
    this.polite = opts.polite;
    this.events = opts.events;

    this.pc = new RTCPeerConnection({
      iceServers: opts.iceServers as RTCIceServer[],
      // Pooling pre-gathers candidates so the first offer already carries them,
      // shaving a round trip off connection setup.
      iceCandidatePoolSize: 4,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      // Dev-only switch used to verify the TURN path actually works, since in
      // normal conditions on a LAN you would never exercise it.
      iceTransportPolicy: opts.forceRelay ? "relay" : "all",
    });

    // Negotiated channels: both peers construct them with matching ids, so
    // there is no ondatachannel handshake and no race over who creates what.
    // Chat is ordered and reliable; the second channel deliberately is not,
    // because a dropped "typing…" is better than a delayed one.
    this.chatChannel = this.pc.createDataChannel("chat", {
      negotiated: true,
      id: 0,
      ordered: true,
    });
    this.fastChannel = this.pc.createDataChannel("fast", {
      negotiated: true,
      id: 1,
      ordered: false,
      maxRetransmits: 0,
    });

    this.chatChannel.onopen = () => {
      this.flushOutbox();
      this.events.onChatReady();
    };

    for (const ch of [this.chatChannel, this.fastChannel]) {
      ch.onmessage = (e) => {
        const decoded = decodeChatMessage(
          typeof e.data === "string" ? e.data : "",
        );
        // The peer is an anonymous stranger, so their DataChannel traffic is
        // untrusted input and gets the same schema validation as the wire
        // protocol. Anything malformed is dropped silently.
        if (decoded.ok) this.events.onChat(decoded.value);
      };
    }

    if (opts.localStream) {
      for (const track of opts.localStream.getTracks()) {
        this.pc.addTrack(track, opts.localStream);
      }
    }
    // Text mode adds no transceivers at all. A DataChannel-only peer connection
    // is completely valid — the offer carries an m=application section and
    // nothing else.
    //
    // Adding recvonly audio/video "so the bundle has a media section" was both
    // unnecessary and actively harmful: both peers created them in their
    // constructor, and an answer can only mirror the m-lines the offer already
    // contains, so the answerer's pair stayed unassociated and immediately
    // fired negotiationneeded — forcing a renegotiation at exactly the moment
    // the SCTP association was being established.

    this.wire();
  }

  private wire(): void {
    const remote = new MediaStream();

    this.pc.ontrack = (e) => {
      for (const track of e.streams[0]?.getTracks() ?? [e.track]) {
        remote.addTrack(track);
      }
      this.events.onRemoteStream(remote);
    };

    this.pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      this.events.onSignal({
        kind: "candidate",
        candidate: e.candidate.candidate,
        sdpMid: e.candidate.sdpMid,
        sdpMLineIndex: e.candidate.sdpMLineIndex,
        usernameFragment: e.candidate.usernameFragment,
      });
    };

    this.pc.onnegotiationneeded = async () => {
      // The polite peer holds its initial offer back. Both sides adding tracks
      // at the same moment would otherwise collide on literally every call —
      // recoverable, but a wasted round trip each time. After the first
      // exchange, either side may renegotiate and the rollback below handles it.
      if (this.polite && !this.hasRemoteDescription) return;

      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        const sdp = this.pc.localDescription?.sdp;
        if (sdp) this.events.onSignal({ kind: "offer", sdp });
      } catch {
        /* superseded by a newer negotiation */
      } finally {
        this.makingOffer = false;
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      this.events.onStateChange(state);

      if (state === "connected" && !this.connectedAt) {
        this.connectedAt = Date.now();
        this.events.onConnected(this.connectedAt - this.startedAt);
        this.startStatsPolling();
      }
      if (state === "failed") this.events.onFailed();
    };

    this.pc.oniceconnectionstatechange = () => {
      // An ICE restart recovers from a network change (wifi to cellular) that
      // would otherwise drop the call.
      if (this.pc.iceConnectionState === "failed") {
        this.pc.restartIce();
      }
    };
  }

  /* ---------------------------------------------------------------- stats -- */

  private startStatsPolling(): void {
    const poll = async () => {
      if (this.closed) return;
      await this.inspectStats();
      this.statsTimer = window.setTimeout(poll, 5000);
    };
    void poll();
  }

  /**
   * Reads the selected candidate pair to find out whether this call is being
   * relayed, and caps the outbound bitrate if it is.
   *
   * This is the lever that controls our only per-byte cost. A relayed 720p call
   * pushes roughly 3 Mbps through our TURN server in each direction; dropping
   * to 500 kbps when — and only when — the relay is actually in use cuts that
   * by around 70% while leaving direct calls at full quality.
   */
  private async inspectStats(): Promise<void> {
    try {
      const stats = await this.pc.getStats();
      let pairId: string | null = null;
      const candidates = new Map<string, { candidateType?: string }>();

      stats.forEach((report) => {
        if (
          report.type === "candidate-pair" &&
          report.state === "succeeded" &&
          (report.nominated || report.selected)
        ) {
          pairId = report.localCandidateId as string;
        }
        if (report.type === "local-candidate") {
          candidates.set(report.id as string, report);
        }
      });

      if (!pairId) return;
      const type = (candidates.get(pairId)?.candidateType ??
        "unknown") as CandidateType;

      if (type !== this.candidateType) {
        this.candidateType = type;
        this.events.onCandidateType(type);
      }

      if (!this.bitrateApplied) {
        this.bitrateApplied = true;
        await this.applyBitrateCap(
          type === "relay" ? RELAY_MAX_BITRATE_BPS : DIRECT_MAX_BITRATE_BPS,
        );
      }
    } catch {
      /* getStats can reject during teardown */
    }
  }

  private async applyBitrateCap(bps: number): Promise<void> {
    const sender = this.pc.getSenders().find((s) => s.track?.kind === "video");
    if (!sender) return;
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0]!.maxBitrate = bps;
    // Tells the encoder to trade resolution for frame rate under the cap, which
    // keeps motion smooth rather than turning a relayed call into a slideshow.
    params.encodings[0]!.scaleResolutionDownBy = bps <= RELAY_MAX_BITRATE_BPS ? 2 : 1;
    try {
      await sender.setParameters(params);
    } catch {
      /* not supported on this browser; the call still works, just uncapped */
    }
  }

  /* -------------------------------------------------------------- signals -- */

  async handleSignal(payload: SignalPayload): Promise<void> {
    if (this.closed) return;

    try {
      if (payload.kind === "offer" || payload.kind === "answer") {
        const description: RTCSessionDescriptionInit = {
          type: payload.kind,
          sdp: payload.sdp,
        };

        const collision =
          description.type === "offer" &&
          (this.makingOffer || this.pc.signalingState !== "stable");

        // The impolite peer wins a collision by ignoring the other's offer; the
        // polite peer rolls its own back. Exactly one side yields, always, so
        // the two can never deadlock waiting on each other.
        this.ignoreOffer = !this.polite && collision;
        if (this.ignoreOffer) return;

        await this.pc.setRemoteDescription(description);
        this.hasRemoteDescription = true;
        await this.flushCandidates();

        if (description.type === "offer") {
          await this.pc.setLocalDescription();
          const sdp = this.pc.localDescription?.sdp;
          if (sdp) this.events.onSignal({ kind: "answer", sdp });
        }
        return;
      }

      if (payload.kind === "candidate") {
        const candidate: RTCIceCandidateInit = {
          candidate: payload.candidate,
          sdpMid: payload.sdpMid ?? undefined,
          sdpMLineIndex: payload.sdpMLineIndex ?? undefined,
          usernameFragment: payload.usernameFragment ?? undefined,
        };
        // Candidates routinely arrive before the description they belong to;
        // adding one early throws, so they queue until it lands.
        if (!this.hasRemoteDescription) {
          this.pendingCandidates.push(candidate);
          return;
        }
        await this.pc.addIceCandidate(candidate).catch(() => {
          if (!this.ignoreOffer) throw new Error("bad candidate");
        });
        return;
      }

      if (payload.kind === "ice-restart") {
        this.pc.restartIce();
      }
    } catch (err) {
      console.warn("[peer] signal handling failed", err);
    }
  }

  private async flushCandidates(): Promise<void> {
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const c of queued) {
      await this.pc.addIceCandidate(c).catch(() => {});
    }
  }

  /* ----------------------------------------------------------------- chat -- */

  /**
   * Returns true when the message is accepted — either sent now, or queued to
   * go out the moment the channel opens.
   *
   * The DataChannel opens slightly after the connection reports `connected`:
   * DTLS finishes first, then the SCTP association forms. Anything typed in
   * that window used to be dropped on the floor with no error and no trace,
   * which from the user's side looks exactly like a broken send button.
   * Queueing is the honest behaviour — they typed it, so it should go.
   *
   * Only real messages are queued. A late "typing…" indicator is worse than
   * none, so those are still discarded when the channel isn't ready.
   */
  sendChat(msg: ChatMessage): boolean {
    const channel = msg.t === "msg" ? this.chatChannel : this.fastChannel;

    if (channel.readyState !== "open") {
      if (msg.t === "msg" && this.outbox.length < 50) {
        this.outbox.push(msg);
        return true;
      }
      return false;
    }

    try {
      channel.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  private flushOutbox(): void {
    const queued = this.outbox;
    this.outbox = [];
    for (const msg of queued) {
      try {
        this.chatChannel.send(JSON.stringify(msg));
      } catch {
        /* peer vanished between opening and flushing */
      }
    }
  }

  get chatReady(): boolean {
    return this.chatChannel.readyState === "open";
  }

  /* -------------------------------------------------------------- teardown -- */

  getSessionStats() {
    return {
      setupMs: this.connectedAt ? this.connectedAt - this.startedAt : 0,
      candidateType: this.candidateType,
      durationMs: this.connectedAt ? Date.now() - this.connectedAt : 0,
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.statsTimer) clearTimeout(this.statsTimer);

    // Detach senders before closing so the shared local tracks survive for the
    // next match. Closing the connection alone doesn't stop them, but being
    // explicit here documents that the stream is deliberately outliving the
    // peer connection.
    for (const sender of this.pc.getSenders()) {
      try {
        this.pc.removeTrack(sender);
      } catch {
        /* connection already closed */
      }
    }

    this.chatChannel.close();
    this.fastChannel.close();
    this.pc.close();
  }
}
