"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ChatMessage,
  type EndReason,
  type IceServer,
  type Mode,
  type PeerProfile,
  type ReportReason,
  type ServerMessage,
  type SignalPayload,
  type Tier,
} from "@callme/protocol";
import type { ConnectionState } from "@callme/ui";
import {
  PeerSession,
  acquireLocalStream,
  getLocalStream,
  releaseLocalStream,
  setTrackEnabled,
  type CandidateType,
} from "@/lib/peer";
import { SignalingClient, type SignalingStatus } from "@/lib/signaling";
import { getFingerprint } from "@/lib/fingerprint";

export type SessionPhase =
  | "idle"
  | "connecting"
  | "permission"
  | "searching"
  | "matched"
  | "live"
  | "ended"
  | "blocked";

export interface DisplayMessage {
  id: string;
  body: string;
  mine: boolean;
  at: number;
}

export interface ChatPreferences {
  mode: Mode;
  lang: string;
  interests: string[];
  preferCountry?: string | null;
}

export interface UseChatSession {
  phase: SessionPhase;
  connection: ConnectionState;
  peer: PeerProfile | null;
  messages: DisplayMessage[];
  peerTyping: boolean;
  chatReady: boolean;
  tier: Tier | null;
  poolSize: number;
  queuedMs: number;
  error: string | null;
  micOn: boolean;
  camOn: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  start: (prefs: ChatPreferences) => Promise<void>;
  next: () => void;
  stop: () => void;
  send: (body: string) => void;
  setTyping: (on: boolean) => void;
  report: (reason: ReportReason, note?: string, evidence?: string) => void;
  block: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
}

export function useChatSession(): UseChatSession {
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [peer, setPeer] = useState<PeerProfile | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [peerTyping, setPeerTyping] = useState(false);
  /** True once the DataChannel is open, which is when chat actually works. */
  const [chatReady, setChatReady] = useState(false);
  const [tier, setTier] = useState<Tier | null>(null);
  const [poolSize, setPoolSize] = useState(0);
  const [queuedMs, setQueuedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const clientRef = useRef<SignalingClient | null>(null);
  const sessionRef = useRef<PeerSession | null>(null);
  const iceServersRef = useRef<IceServer[]>([]);
  const selfIdRef = useRef<string>("");
  const roomIdRef = useRef<string | null>(null);
  const prefsRef = useRef<ChatPreferences | null>(null);
  const typingTimer = useRef<number | null>(null);
  const politeRef = useRef(false);

  /**
   * Signals can land before the local PeerSession exists: both peers create
   * theirs on `match.ready`, and whichever browser gets there first will start
   * offering immediately. Buffering here rather than dropping avoids a dead
   * call that only fails after the ICE timeout.
   */
  const signalBuffer = useRef<SignalPayload[]>([]);

  /* ------------------------------------------------------------ teardown -- */

  const teardownPeer = useCallback(
    (reason: EndReason, reportStats: boolean) => {
      const session = sessionRef.current;
      if (!session) return;

      if (reportStats && roomIdRef.current) {
        const stats = session.getSessionStats();
        clientRef.current?.send({
          t: "session.stats",
          roomId: roomIdRef.current,
          setupMs: stats.setupMs,
          candidateType: stats.candidateType,
          durationMs: stats.durationMs,
          endReason: reason,
        });
      }

      session.close();
      sessionRef.current = null;
      signalBuffer.current = [];
      setRemoteStream(null);
      setPeerTyping(false);
      setChatReady(false);
    },
    [],
  );

  /* -------------------------------------------------------------- peering -- */

  const createPeer = useCallback(
    (polite: boolean) => {
      if (sessionRef.current) return;

      const session = new PeerSession({
        iceServers: iceServersRef.current,
        polite,
        localStream: getLocalStream(),
        // Dev-only escape hatch to exercise the TURN path, which a LAN would
        // otherwise never take. Set ?relay=1 on /chat.
        forceRelay:
          typeof window !== "undefined" &&
          new URLSearchParams(window.location.search).get("relay") === "1",
        events: {
          onRemoteStream: (stream) => setRemoteStream(stream),
          onSignal: (payload) => {
            if (!roomIdRef.current) return;
            clientRef.current?.send({
              t: "signal",
              roomId: roomIdRef.current,
              payload,
            });
          },
          onChat: (msg) => handlePeerChat(msg),
          onChatReady: () => setChatReady(true),
          onStateChange: (state) => {
            if (state === "connecting") setConnection("connecting");
            if (state === "disconnected") setConnection("poor");
          },
          onCandidateType: (type: CandidateType) => {
            // Surfaced in the UI: a relayed call is quality-capped on purpose,
            // and saying so beats letting the user assume the app is bad.
            setConnection(type === "relay" ? "relayed" : "connected");
          },
          onConnected: () => {
            setPhase("live");
            setConnection((c) => (c === "relayed" ? c : "connected"));
          },
          onFailed: () => {
            setConnection("failed");
            teardownPeer("ice_failed", true);
            // A failed connection is nobody's fault and the right recovery is
            // simply the next person, not an error screen.
            skipInternal("ice_failed");
          },
        },
      });

      sessionRef.current = session;

      // Drain anything that arrived while we were still constructing.
      for (const payload of signalBuffer.current) {
        void session.handleSignal(payload);
      }
      signalBuffer.current = [];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teardownPeer],
  );

  const handlePeerChat = useCallback((msg: ChatMessage) => {
    switch (msg.t) {
      case "msg":
        setMessages((prev) => [
          ...prev,
          { id: msg.id, body: msg.body, mine: false, at: msg.at },
        ]);
        setPeerTyping(false);
        break;
      case "typing":
        setPeerTyping(msg.on);
        break;
      case "bye":
        setPeerTyping(false);
        break;
    }
  }, []);

  /* ------------------------------------------------------------- messages -- */

  const onServerMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.t) {
        case "hello.ok": {
          selfIdRef.current = msg.userId;
          iceServersRef.current = msg.iceServers;
          // Queue only once the ICE config is in hand — matching before we can
          // actually connect would just produce failed calls.
          const prefs = prefsRef.current;
          if (prefs) {
            clientRef.current?.send({
              t: "queue.join",
              mode: prefs.mode,
              lang: prefs.lang,
              interests: prefs.interests,
              preferCountry: prefs.preferCountry ?? null,
            });
            setPhase("searching");
            setConnection("searching");
          }
          break;
        }

        case "queue.waiting": {
          setTier(msg.tier);
          setQueuedMs(msg.queuedMs);
          setPoolSize(msg.poolSize ?? 0);
          break;
        }

        case "match.proposed": {
          roomIdRef.current = msg.roomId;
          // Taken from the server rather than recomputed locally: both peers
          // must agree on who yields during offer glare, and one source of
          // truth is the only way that is guaranteed.
          politeRef.current = msg.polite;
          setPeer(msg.peer);
          setMessages([]);
          setPhase("matched");
          setConnection("connecting");
          // ACK immediately. The server holds the pair for five seconds and
          // cancels if either side stays silent, so any delay here risks
          // losing a perfectly good match.
          clientRef.current?.send({ t: "match.ack", roomId: msg.roomId });
          break;
        }

        case "match.ready": {
          // Both peers construct here, only after each has ACKed, so neither
          // starts negotiating with a tab that was never going to answer.
          createPeer(politeRef.current);
          break;
        }

        case "match.cancelled": {
          roomIdRef.current = null;
          setPeer(null);
          teardownPeer("ack_timeout", false);
          setPhase("searching");
          setConnection("searching");
          requeue();
          break;
        }

        case "signal": {
          const session = sessionRef.current;
          if (session) void session.handleSignal(msg.payload);
          else signalBuffer.current.push(msg.payload);
          break;
        }

        case "peer.left": {
          teardownPeer(msg.reason, true);
          roomIdRef.current = null;
          setPeer(null);
          setPhase("searching");
          setConnection("searching");
          requeue();
          break;
        }

        case "banned": {
          setPhase("blocked");
          setError(
            msg.until
              ? `You're suspended until ${new Date(msg.until).toLocaleString()}. Reason: ${msg.reason}`
              : `Your account has been permanently suspended. Reason: ${msg.reason}`,
          );
          clientRef.current?.close();
          break;
        }

        case "error": {
          if (msg.code === "rate_limited") {
            setError("You're going a bit fast — give it a second.");
          } else if (msg.code !== "server_shutting_down") {
            setError(msg.message);
          }
          break;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [createPeer, teardownPeer],
  );

  const requeue = useCallback(() => {
    const prefs = prefsRef.current;
    if (!prefs) return;
    clientRef.current?.send({
      t: "queue.join",
      mode: prefs.mode,
      lang: prefs.lang,
      interests: prefs.interests,
      preferCountry: prefs.preferCountry ?? null,
    });
  }, []);

  const onStatus = useCallback((status: SignalingStatus) => {
    if (status === "connecting" || status === "reconnecting") {
      setPhase((p) => (p === "idle" ? "connecting" : p));
    }
    if (status === "banned") setPhase("blocked");
  }, []);

  /* --------------------------------------------------------------- public -- */

  const start = useCallback(
    async (prefs: ChatPreferences) => {
      setError(null);
      prefsRef.current = prefs;

      if (prefs.mode === "video") {
        setPhase("permission");
        try {
          const stream = await acquireLocalStream("video");
          setLocalStream(stream);
        } catch {
          setError(
            "We couldn't access your camera. Check your browser permissions, or switch to text-only chat.",
          );
          setPhase("idle");
          return;
        }
      }

      setPhase("connecting");
      const fingerprint = await getFingerprint();

      const client = new SignalingClient({
        onMessage: onServerMessage,
        onStatus,
        onFatal: (reason) => {
          setError(
            reason === "age_not_confirmed"
              ? "Please confirm your age to continue."
              : reason,
          );
          setPhase("blocked");
        },
      });
      clientRef.current = client;
      await client.connect(fingerprint);
    },
    [onServerMessage, onStatus],
  );

  const skipInternal = useCallback(
    (reason: EndReason) => {
      const roomId = roomIdRef.current;
      if (!roomId) return;
      teardownPeer(reason, reason !== "ice_failed");
      clientRef.current?.send({ t: "peer.skip", roomId, requeue: true });
      roomIdRef.current = null;
      setPeer(null);
      setMessages([]);
      setPhase("searching");
      setConnection("searching");
    },
    [teardownPeer],
  );

  const next = useCallback(() => skipInternal("skipped"), [skipInternal]);

  const stop = useCallback(() => {
    teardownPeer("disconnected", true);
    clientRef.current?.close();
    clientRef.current = null;
    releaseLocalStream();
    setLocalStream(null);
    roomIdRef.current = null;
    setPeer(null);
    setMessages([]);
    setPhase("ended");
    setConnection("idle");
  }, [teardownPeer]);

  const send = useCallback((body: string) => {
    const trimmed = body.trim();
    const session = sessionRef.current;
    // No longer gated on chatReady: sendChat queues anything typed before the
    // DataChannel opens and flushes it on open. Dropping the message here was
    // indistinguishable from a broken send button.
    if (!trimmed || !session) return;

    const msg: ChatMessage = {
      t: "msg",
      id: crypto.randomUUID().slice(0, 32),
      body: trimmed.slice(0, 2000),
      at: Date.now(),
    };
    // Straight down the DataChannel — this never touches our servers, which is
    // both why chat is free to run and why we could not log it if we wanted to.
    if (session.sendChat(msg)) {
      setMessages((prev) => [
        ...prev,
        { id: msg.id, body: msg.body, mine: true, at: msg.at },
      ]);
    }
  }, []);

  const setTyping = useCallback((on: boolean) => {
    sessionRef.current?.sendChat({ t: "typing", on });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (on) {
      typingTimer.current = window.setTimeout(() => {
        sessionRef.current?.sendChat({ t: "typing", on: false });
      }, 3000);
    }
  }, []);

  const report = useCallback(
    (reason: ReportReason, note?: string, evidence?: string) => {
      const roomId = roomIdRef.current;
      if (!roomId) return;
      clientRef.current?.send({ t: "peer.report", roomId, reason, note, evidence });
      teardownPeer("reported", true);
      roomIdRef.current = null;
      setPeer(null);
      setMessages([]);
      setPhase("searching");
      setConnection("searching");
      requeue();
    },
    [teardownPeer, requeue],
  );

  const block = useCallback(() => {
    const roomId = roomIdRef.current;
    if (!roomId) return;
    clientRef.current?.send({ t: "peer.block", roomId });
    teardownPeer("skipped", true);
    roomIdRef.current = null;
    setPeer(null);
    setMessages([]);
    setPhase("searching");
    setConnection("searching");
    requeue();
  }, [teardownPeer, requeue]);

  const toggleMic = useCallback(() => {
    setMicOn((on) => {
      setTrackEnabled("audio", !on);
      return !on;
    });
  }, []);

  const toggleCam = useCallback(() => {
    setCamOn((on) => {
      setTrackEnabled("video", !on);
      return !on;
    });
  }, []);

  /* -------------------------------------------------------------- cleanup -- */

  useEffect(() => {
    return () => {
      sessionRef.current?.close();
      clientRef.current?.close();
      releaseLocalStream();
    };
  }, []);

  return {
    phase,
    connection,
    peer,
    messages,
    peerTyping,
    chatReady,
    tier,
    poolSize,
    queuedMs,
    error,
    micOn,
    camOn,
    localStream,
    remoteStream,
    start,
    next,
    stop,
    send,
    setTyping,
    report,
    block,
    toggleMic,
    toggleCam,
  };
}
