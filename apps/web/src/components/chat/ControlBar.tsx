"use client";

import { useState } from "react";
import {
  Flag,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MoreHorizontal,
  PhoneOff,
  SkipForward,
  UserX,
  Video,
  VideoOff,
} from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Tooltip,
  cn,
} from "@callme/ui";

interface ControlBarProps {
  micOn: boolean;
  camOn: boolean;
  videoMode: boolean;
  chatOpen: boolean;
  inCall: boolean;
  unreadCount: number;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleChat: () => void;
  onNext: () => void;
  onStop: () => void;
  onReport: () => void;
  onBlock: () => void;
}

export function ControlBar({
  micOn,
  camOn,
  videoMode,
  chatOpen,
  inCall,
  unreadCount,
  onToggleMic,
  onToggleCam,
  onToggleChat,
  onNext,
  onStop,
  onReport,
  onBlock,
}: ControlBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-[var(--radius-full)] p-1.5 sm:gap-2 sm:p-2",
          "border border-[var(--border)] bg-[var(--surface-overlay)] backdrop-blur-xl",
          "shadow-[var(--shadow-lg)]",
          // Never let the bar exceed the viewport on a narrow phone.
          "max-w-[calc(100vw-1.5rem)]",
        )}
        role="toolbar"
        aria-label="Call controls"
      >
        {videoMode ? (
          <>
            <Tooltip content={micOn ? "Mute (M)" : "Unmute (M)"}>
              <Button
                variant={micOn ? "secondary" : "danger"}
                size="icon"
                pill
                onClick={onToggleMic}
                aria-pressed={!micOn}
                aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
                className="sm:size-12"
              >
                {micOn ? <Mic /> : <MicOff />}
              </Button>
            </Tooltip>

            <Tooltip content={camOn ? "Camera off (V)" : "Camera on (V)"}>
              <Button
                variant={camOn ? "secondary" : "danger"}
                size="icon"
                pill
                onClick={onToggleCam}
                aria-pressed={!camOn}
                aria-label={camOn ? "Turn camera off" : "Turn camera on"}
                className="sm:size-12"
              >
                {camOn ? <Video /> : <VideoOff />}
              </Button>
            </Tooltip>
          </>
        ) : null}

        {/* The primary action. Skipping is the core loop, so it keeps the
            accent colour and the largest touch target at every width. */}
        <Tooltip content="Next person (Esc)">
          <Button
            variant="primary"
            pill
            onClick={onNext}
            aria-label="Skip to the next person"
            className="h-10 shrink-0 px-4 sm:h-12 sm:px-6"
          >
            <SkipForward />
            Next
          </Button>
        </Tooltip>

        <Tooltip content={chatOpen ? "Hide chat" : "Show chat"}>
          <Button
            variant="secondary"
            size="icon"
            pill
            onClick={onToggleChat}
            aria-pressed={chatOpen}
            aria-label={
              unreadCount > 0
                ? `Show chat, ${unreadCount} unread`
                : chatOpen
                  ? "Hide chat panel"
                  : "Show chat panel"
            }
            className="relative lg:hidden"
          >
            <MessageSquare />
            {unreadCount > 0 && !chatOpen ? (
              <span
                className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-[var(--accent-fg)]"
                aria-hidden
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </Button>
        </Tooltip>

        {/* Desktop keeps the destructive actions inline. On a phone there is no
            room for seven targets, so they move into a sheet — which also puts
            a deliberate extra tap in front of "report" and "leave". */}
        <div className="mx-1 hidden h-8 w-px bg-[var(--border)] sm:block" aria-hidden />

        <div className="hidden items-center gap-2 sm:flex">
          <Tooltip content="Block this person">
            <Button
              variant="ghost"
              size="icon-lg"
              pill
              onClick={onBlock}
              disabled={!inCall}
              aria-label="Block this person"
            >
              <UserX />
            </Button>
          </Tooltip>

          <Tooltip content="Report">
            <Button
              variant="ghost"
              size="icon-lg"
              pill
              onClick={onReport}
              disabled={!inCall}
              aria-label="Report this person"
              className="text-[var(--warning)] hover:text-[var(--warning)]"
            >
              <Flag />
            </Button>
          </Tooltip>

          <Tooltip content="Leave">
            <Button
              variant="danger"
              size="icon-lg"
              pill
              onClick={onStop}
              aria-label="Leave the chat"
            >
              <PhoneOff />
            </Button>
          </Tooltip>
        </div>

        <Button
          variant="secondary"
          size="icon"
          pill
          onClick={() => setMoreOpen(true)}
          aria-label="More options"
          className="sm:hidden"
        >
          <MoreHorizontal />
        </Button>
      </div>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent variant="sheet" showClose={false} className="sm:hidden">
          <DialogTitle className="sr-only">More options</DialogTitle>

          <div className="flex flex-col gap-1">
            <SheetAction
              icon={<UserX />}
              label="Block this person"
              hint="You'll never be matched again"
              disabled={!inCall}
              onClick={() => {
                setMoreOpen(false);
                onBlock();
              }}
            />
            <SheetAction
              icon={<Flag />}
              label="Report"
              hint="Reviewed by a human"
              tone="warning"
              disabled={!inCall}
              onClick={() => {
                setMoreOpen(false);
                onReport();
              }}
            />
            <SheetAction
              icon={<LogOut />}
              label="Leave chat"
              hint="Ends the session"
              tone="danger"
              onClick={() => {
                setMoreOpen(false);
                onStop();
              }}
            />
          </div>

          <Button
            variant="secondary"
            size="lg"
            className="mt-3 w-full"
            onClick={() => setMoreOpen(false)}
          >
            Cancel
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SheetAction({
  icon,
  label,
  hint,
  tone = "neutral",
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  tone?: "neutral" | "warning" | "danger";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-3.5 text-left",
        "transition-colors active:bg-[var(--surface-raised)]",
        "disabled:pointer-events-none disabled:opacity-40",
        "[&_svg]:size-5 [&_svg]:shrink-0",
        tone === "warning" && "text-[var(--warning)]",
        tone === "danger" && "text-[var(--danger)]",
      )}
    >
      {icon}
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-[var(--text-subtle)]">{hint}</span>
      </span>
    </button>
  );
}
