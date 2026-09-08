"use client";

import {
  HEARTBEAT_INTERVAL_MS,
  decodeServerMessage,
  encode,
  type ClientMessage,
  type ServerMessage,
} from "@callme/protocol";

export type SignalingStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "banned";

export interface SignalingOptions {
  onMessage: (msg: ServerMessage) => void;
  onStatus: (status: SignalingStatus) => void;
  onFatal: (reason: string) => void;
}

interface TicketResponse {
  ticket: string;
  url: string;
  user: { id: string; displayName: string; isGuest: boolean; trustScore: number };
}

/**
 * WebSocket client for the signaling server.
 *
 * Note how little traffic this carries. Per match it exchanges a handful of
 * frames — an offer, an answer, a few ICE candidates — and then goes quiet for
 * the entire call, because the media and the chat both travel peer-to-peer.
 * The socket stays open only so we can find the next partner.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private opts: SignalingOptions;
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private attempts = 0;
  private manuallyClosed = false;
  private fingerprint: string | null = null;

  constructor(opts: SignalingOptions) {
    this.opts = opts;
  }

  async connect(fingerprint: string | null): Promise<void> {
    this.fingerprint = fingerprint;
    this.manuallyClosed = false;
    this.opts.onStatus(this.attempts === 0 ? "connecting" : "reconnecting");

    let ticket: TicketResponse;
    try {
      const res = await fetch("/api/ws-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint }),
      });

      if (res.status === 403) {
        const body = await res.json();
        this.opts.onStatus("banned");
        this.opts.onFatal(
          body.error === "age_not_confirmed"
            ? "age_not_confirmed"
            : (body.message ?? "You are banned"),
        );
        return;
      }
      if (!res.ok) throw new Error(`ticket ${res.status}`);
      ticket = await res.json();
    } catch {
      this.scheduleReconnect();
      return;
    }

    const ws = new WebSocket(ticket.url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      this.opts.onStatus("open");
      // The ticket is single-use and expires in 60s, so it is spent
      // immediately rather than held.
      this.send({ t: "hello", ticket: ticket.ticket });
      this.startPing();
    };

    ws.onmessage = (event) => {
      const decoded = decodeServerMessage(
        typeof event.data === "string" ? event.data : "",
      );
      if (!decoded.ok) return;

      if (decoded.value.t === "error") {
        if (decoded.value.code === "bad_ticket") {
          // The ticket lapsed (a laptop that slept, usually). Get a new one
          // rather than sitting on a dead socket.
          this.reconnectSoon();
          return;
        }
        if (decoded.value.code === "server_shutting_down") {
          // A deploy is draining this node. Reconnect and land on another one.
          this.reconnectSoon();
          return;
        }
      }

      this.opts.onMessage(decoded.value);
    };

    ws.onclose = () => {
      this.stopPing();
      if (!this.manuallyClosed) this.scheduleReconnect();
      else this.opts.onStatus("closed");
    };

    ws.onerror = () => {
      // onclose always follows, so reconnection is handled there.
    };
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      this.send({ t: "ping" });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private reconnectSoon(): void {
    try {
      this.ws?.close();
    } catch {
      /* already closing */
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.manuallyClosed || this.reconnectTimer) return;

    this.attempts += 1;
    this.opts.onStatus("reconnecting");

    // Exponential backoff with jitter. Without the jitter, a node restart would
    // have every client it dropped reconnect in the same millisecond and
    // immediately knock over whichever node they land on.
    const base = Math.min(1000 * 2 ** (this.attempts - 1), 15_000);
    const delay = base * (0.7 + Math.random() * 0.6);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(this.fingerprint);
    }, delay);
  }

  send(msg: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(encode(msg));
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    this.manuallyClosed = true;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
    this.opts.onStatus("closed");
  }
}
