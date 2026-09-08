"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff, EyeOff, MicOff } from "lucide-react";
import { Avatar, ConnectionPill, cn, type ConnectionState } from "@callme/ui";
import type { PeerProfile } from "@callme/protocol";

interface VideoStageProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  peer: PeerProfile | null;
  connection: ConnectionState;
  camOn: boolean;
  micOn: boolean;
  /** Set by the on-device NSFW classifier; blurs the remote feed pre-emptively. */
  remoteBlurred: boolean;
  onUnblur: () => void;
  /**
   * Lifted so the NSFW guard and the report-evidence capture can read frames
   * from the same element the user is looking at.
   */
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  children?: React.ReactNode;
}

function useStream(
  ref: React.RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) {
      // Autoplay can still be refused (a background tab, an aggressive policy);
      // failing silently here is correct because the controls remain usable and
      // the stream attaches as soon as the tab is foregrounded.
      el.play().catch(() => {});
    }
  }, [ref, stream]);
}

export function VideoStage({
  localStream,
  remoteStream,
  peer,
  connection,
  camOn,
  micOn,
  remoteBlurred,
  onUnblur,
  remoteVideoRef: remoteRef,
  children,
}: VideoStageProps) {
  const localRef = useRef<HTMLVideoElement>(null);
  // Top-right by default: the control bar owns the bottom-centre of the stage,
  // and on a narrow phone a bottom-corner self-view collides with it.
  const [pipCorner, setPipCorner] = useState<"br" | "bl" | "tr" | "tl">("tr");

  useStream(localRef, localStream);
  useStream(remoteRef, remoteStream);

  const cornerClass = {
    br: "bottom-4 right-4",
    bl: "bottom-4 left-4",
    tr: "top-4 right-4",
    tl: "top-4 left-4",
  }[pipCorner];

  return (
    // Full-bleed on mobile — screen space is scarce and a rounded, inset card
    // wastes it. The framed look returns at desktop widths.
    <div className="relative size-full overflow-hidden bg-[var(--bg-subtle)] lg:rounded-[var(--radius-xl)]">
      {/* Remote feed — the focal point, so it gets the whole stage. */}
      <video
        ref={remoteRef}
        autoPlay
        playsInline
        className={cn(
          "size-full object-cover transition-[filter] duration-[var(--dur-slow)]",
          remoteBlurred && "blur-2xl saturate-50",
          !remoteStream && "opacity-0",
        )}
      />

      {!remoteStream ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
          {peer ? (
            <>
              <Avatar name={peer.displayName} size={80} />
              <p className="text-sm text-[var(--text-muted)]">
                Connecting to {peer.displayName}…
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      {/* The classifier is a heuristic, so the blur is a prompt rather than a
          verdict: the viewer decides, and reporting stays one tap away. */}
      {remoteBlurred ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 p-6 text-center backdrop-blur-sm">
          <EyeOff className="size-8 text-[var(--warning)]" aria-hidden />
          <p className="max-w-xs text-sm font-medium text-white">
            This video may contain explicit content, so we&rsquo;ve hidden it.
          </p>
          <button
            onClick={onUnblur}
            className="rounded-[var(--radius-full)] border border-white/30 px-4 py-1.5 text-sm text-white transition-colors hover:bg-white/10"
          >
            Show anyway
          </button>
        </div>
      ) : null}

      {/* Local preview. Mirrored, because an unmirrored view of yourself is
          disorienting — every video app does this and users notice when it's
          missing far more than when it's there. */}
      <div
        className={cn(
          "absolute z-[var(--z-pip)] overflow-hidden rounded-[var(--radius-lg)]",
          "border border-white/10 shadow-[var(--shadow-lg)]",
          "h-28 w-20 sm:h-36 sm:w-52",
          "transition-[top,bottom,left,right] duration-[var(--dur-base)] ease-[var(--ease-out)]",
          cornerClass,
        )}
      >
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className={cn("size-full scale-x-[-1] object-cover", !camOn && "opacity-0")}
        />

        {!camOn ? (
          <div className="absolute inset-0 grid place-items-center bg-[var(--surface)]">
            <CameraOff className="size-5 text-[var(--text-subtle)]" aria-hidden />
          </div>
        ) : null}

        {!micOn ? (
          <span className="absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-[var(--danger)]">
            <MicOff className="size-3.5 text-white" aria-hidden />
          </span>
        ) : null}

        <button
          onClick={() =>
            setPipCorner((c) =>
              c === "br" ? "bl" : c === "bl" ? "tl" : c === "tl" ? "tr" : "br",
            )
          }
          className="absolute inset-0"
          aria-label="Move self-view to the next corner"
        />
      </div>

      <div className="absolute left-4 top-4 z-[var(--z-sticky)] flex items-center gap-2">
        <ConnectionPill state={connection} />
      </div>

      {children}
    </div>
  );
}
