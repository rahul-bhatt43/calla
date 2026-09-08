"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Send } from "lucide-react";
import { Button, cn } from "@callme/ui";
import type { DisplayMessage } from "@/hooks/useChatSession";

interface ChatPanelProps {
  messages: DisplayMessage[];
  peerTyping: boolean;
  peerName: string | null;
  disabled: boolean;
  /** DataChannel open. False briefly after connecting while SCTP comes up. */
  ready: boolean;
  onSend: (body: string) => void;
  onTyping: (on: boolean) => void;
  /** Mobile only — the desktop rail has no close affordance. */
  onClose?: () => void;
}

export function ChatPanel({
  messages,
  peerTyping,
  peerName,
  disabled,
  ready,
  onSend,
  onTyping,
  onClose,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  // Follow new messages, but only if the user hasn't scrolled up to re-read
  // something. Yanking someone back to the bottom mid-scroll is infuriating.
  useEffect(() => {
    const el = listRef.current;
    if (!el || !pinnedToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, peerTyping]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    pinnedToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const submit = () => {
    const body = draft.trim();
    if (!body || disabled) return;
    onSend(body);
    setDraft("");
    onTyping(false);
  };

  return (
    <div className="flex h-full flex-col bg-[var(--surface)]">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--border)] px-4">
        <h2 className="text-sm font-semibold">Chat</h2>
        <p className="ml-auto truncate text-xs text-[var(--text-subtle)]">
          {disabled ? "Not connected" : ready ? "Peer to peer" : "Connecting…"}
        </p>
        {onClose ? (
          <button
            onClick={onClose}
            aria-label="Hide chat"
            className="-mr-2 shrink-0 rounded-[var(--radius-sm)] p-2 text-[var(--text-subtle)] transition-colors active:bg-[var(--surface-raised)]"
          >
            <ChevronDown className="size-5" aria-hidden />
          </button>
        ) : null}
      </header>

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 space-y-2 overflow-y-auto p-4"
        // Messages arrive asynchronously from another person; without a live
        // region a screen-reader user simply never learns they came in.
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-[var(--text-subtle)]">
            {disabled
              ? "Chat opens once you're connected."
              : `Say hello to ${peerName ?? "your partner"}.`}
          </p>
        ) : null}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn("flex", m.mine ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-[var(--radius-lg)] px-3 py-2 text-sm leading-relaxed",
                // `break-words` is not optional here: a stranger can and will
                // paste a 500-character unbroken string to break your layout.
                "whitespace-pre-wrap break-words",
                m.mine
                  ? "bg-[var(--accent)] text-[var(--accent-fg)] rounded-br-[var(--radius-xs)]"
                  : "bg-[var(--surface-raised)] text-[var(--text)] rounded-bl-[var(--radius-xs)]",
              )}
            >
              {m.body}
            </div>
          </div>
        ))}

        {peerTyping ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-[var(--radius-lg)] bg-[var(--surface-raised)] px-3 py-2.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-bounce rounded-full bg-[var(--text-subtle)]"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
              <span className="sr-only">{peerName} is typing</span>
            </div>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex shrink-0 items-end gap-2 border-t border-[var(--border)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-3"
      >
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onTyping(e.target.value.length > 0);
          }}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks the line — the convention every
            // chat app has trained people to expect.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={disabled}
          rows={1}
          maxLength={2000}
          placeholder={
            disabled
              ? "Not connected"
              : ready
                ? "Message…"
                : "Connecting — messages will send once ready"
          }
          aria-label="Message"
          className={cn(
            "max-h-32 min-h-10 flex-1 resize-none rounded-[var(--radius-md)] bg-[var(--surface-sunken)]",
            // 16px on mobile is not a style choice: iOS Safari zooms the whole
            // page when focusing an input with a smaller font, and the user is
            // then stuck at that zoom level mid-call.
            "border border-[var(--border)] px-3 py-2 text-base leading-relaxed sm:text-sm",
            "focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]",
            "disabled:opacity-60",
          )}
        />
        <Button
          type="submit"
          size="icon"
          disabled={disabled || draft.trim().length === 0}
          aria-label="Send message"
        >
          <Send />
        </Button>
      </form>
    </div>
  );
}
