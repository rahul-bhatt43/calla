"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, Sparkles, Video as VideoIcon, MessageSquareText } from "lucide-react";
import type { Mode, ReportReason } from "@callme/protocol";
import { brand } from "@callme/ui/brand";
import {
  Avatar,
  Button,
  Card,
  CardBody,
  ConnectionPill,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
  useToast,
} from "@callme/ui";
import { useChatSession } from "@/hooks/useChatSession";
import { useNsfwGuard } from "@/hooks/useNsfwGuard";
import { confirmAge } from "@/app/actions";
import { VideoStage } from "./VideoStage";
import { ChatPanel } from "./ChatPanel";
import { ControlBar } from "./ControlBar";
import { MatchmakingOverlay } from "./MatchmakingOverlay";
import { ReportDialog } from "./ReportDialog";

interface InterestOption {
  id: string;
  label: string;
  category: string;
  emoji: string | null;
}

export function ChatClient({
  interests,
  ageConfirmed,
  displayName,
  isGuest,
}: {
  interests: InterestOption[];
  ageConfirmed: boolean;
  displayName: string;
  isGuest: boolean;
}) {
  const [confirmed, setConfirmed] = useState(ageConfirmed);
  // A first-time visitor has no identity until they pass the age gate, since
  // that Server Action is where the guest is created. Their name arrives with
  // the action's result rather than from the initial server render.
  const [name, setName] = useState(displayName);
  const [mode, setMode] = useState<Mode>("video");
  const [selected, setSelected] = useState<string[]>([]);
  // Closed by default; opened on mount only where there's a dedicated rail for
  // it. On a phone the chat costs the video 42% of the screen, so opening it
  // should be the user's decision, not ours.
  const [chatOpen, setChatOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const seenCount = useRef(0);

  useEffect(() => {
    setChatOpen(window.matchMedia("(min-width: 1024px)").matches);
  }, []);

  const session = useChatSession();
  const { toast } = useToast();
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const guard = useNsfwGuard(remoteVideoRef, mode === "video" && session.phase === "live");

  // Each new partner starts from a clean slate — carrying a blur or a dismissal
  // across a skip would either hide an innocent person or unhide a flagged one.
  useEffect(() => {
    guard.reset();
  }, [session.peer?.id, guard]);

  useEffect(() => {
    if (session.error) {
      toast({ title: "Heads up", description: session.error, tone: "warning" });
    }
  }, [session.error, toast]);

  /**
   * Unread badge for the collapsed mobile chat. Without it, a message arriving
   * while the panel is closed is completely invisible — the peer is talking and
   * the user has no idea.
   */
  useEffect(() => {
    if (chatOpen) {
      seenCount.current = session.messages.length;
      setUnread(0);
      return;
    }
    const fresh = session.messages
      .slice(seenCount.current)
      .filter((m) => !m.mine).length;
    seenCount.current = session.messages.length;
    if (fresh > 0) setUnread((n) => n + fresh);
  }, [session.messages, chatOpen]);

  // A new partner starts a new conversation; a stale badge would be wrong.
  useEffect(() => {
    seenCount.current = 0;
    setUnread(0);
  }, [session.peer?.id]);

  /* ---------------------------------------------------------- shortcuts -- */

  useEffect(() => {
    if (session.phase !== "live" && session.phase !== "matched") return;

    const onKey = (e: KeyboardEvent) => {
      // Never hijack keys while the user is composing a message.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        session.next();
      }
      if (e.key.toLowerCase() === "m") session.toggleMic();
      if (e.key.toLowerCase() === "v" && mode === "video") session.toggleCam();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, mode]);

  const toggleInterest = useCallback((id: string) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((i) => i !== id)
        : prev.length >= 10
          ? prev
          : [...prev, id],
    );
  }, []);

  const handleReport = (reason: ReportReason, note: string, evidence?: string) => {
    session.report(reason, note, evidence);
    toast({
      title: "Report submitted",
      description: "Thanks — a moderator will review it. You won't be matched again.",
      tone: "success",
    });
  };

  /* -------------------------------------------------------------- gates -- */

  if (!confirmed) {
    return (
      <AgeGate
        onConfirm={async () => {
          const result = await confirmAge();
          setName(result.displayName);
          setConfirmed(true);
        }}
      />
    );
  }

  if (session.phase === "blocked") {
    return (
      <CenteredMessage
        icon={<ShieldAlert className="size-8 text-[var(--danger)]" />}
        title="You can't join right now"
        body={session.error ?? "Your access has been restricted."}
      />
    );
  }

  /* --------------------------------------------------------------- lobby -- */

  const inLobby = session.phase === "idle" || session.phase === "ended";

  if (inLobby) {
    return (
      <main id="main" className="relative min-h-dvh">
        <div className="aurora pointer-events-none absolute inset-0" aria-hidden />

        <div className="container-page relative flex min-h-dvh flex-col justify-center py-16">
          <Link
            href="/"
            className="mb-8 inline-flex w-fit items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            <ArrowLeft className="size-4" />
            Back to {brand.name}
          </Link>

          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {session.phase === "ended" ? "Go again?" : `Hey, ${name}`}
            </h1>
            <p className="mt-3 text-[var(--text-muted)]">
              Pick how you want to talk and what you&rsquo;re into. Interests are
              optional — we&rsquo;ll widen the search automatically if nobody
              matches.
            </p>

            <Tabs
              value={mode}
              onValueChange={(v) => setMode(v as Mode)}
              className="mt-8"
            >
              <TabsList>
                <TabsTrigger value="video">
                  <VideoIcon className="size-4" />
                  Video
                </TabsTrigger>
                <TabsTrigger value="text">
                  <MessageSquareText className="size-4" />
                  Text only
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <section className="mt-8" aria-labelledby="interests-heading">
              <div className="flex items-baseline justify-between">
                <h2 id="interests-heading" className="text-sm font-medium">
                  Interests
                </h2>
                <span className="text-xs text-[var(--text-subtle)]">
                  {selected.length}/10
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {interests.map((interest) => {
                  const on = selected.includes(interest.id);
                  return (
                    <button
                      key={interest.id}
                      onClick={() => toggleInterest(interest.id)}
                      aria-pressed={on}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-[var(--radius-full)] border px-3 py-1.5 text-sm",
                        "transition-[background-color,border-color,transform] duration-[var(--dur-fast)]",
                        "active:scale-95",
                        on
                          ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]"
                          : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
                      )}
                    >
                      {interest.emoji ? (
                        <span aria-hidden>{interest.emoji}</span>
                      ) : null}
                      {interest.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Button
                size="lg"
                onClick={() =>
                  session.start({ mode, lang: "en", interests: selected })
                }
                loading={session.phase === "connecting"}
                className="px-8"
              >
                <Sparkles />
                Start chatting
              </Button>

              {isGuest ? (
                <p className="text-sm text-[var(--text-subtle)]">
                  You&rsquo;re browsing as a guest.{" "}
                  <Link href="/signup" className="text-[var(--accent)] underline underline-offset-4">
                    Create an account
                  </Link>{" "}
                  to keep your interests and reputation.
                </p>
              ) : null}
            </div>

            <Card className="mt-10 max-w-lg">
              <CardBody className="flex gap-3 p-4">
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
                <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                  Be kind, and keep it {brand.minimumAge}+. Explicit video is
                  detected on your own device and reported content is reviewed by
                  a human.{" "}
                  <Link href="/safety" className="text-[var(--accent)] underline underline-offset-4">
                    How safety works
                  </Link>
                </p>
              </CardBody>
            </Card>
          </div>
        </div>
      </main>
    );
  }

  /* ---------------------------------------------------------------- live -- */

  const searching = session.phase === "searching" || session.phase === "connecting";
  const inCall = session.phase === "live";

  return (
    <main id="main" className="flex h-dvh flex-col overflow-hidden bg-[var(--bg)]">
      {/* Padding only from lg up: on a phone every pixel of inset is video the
          user doesn't get. */}
      <div className="flex min-h-0 flex-1 lg:gap-3 lg:p-3">
        <div className="relative min-h-0 min-w-0 flex-1">
          {mode === "video" ? (
            <VideoStage
              localStream={session.localStream}
              remoteStream={session.remoteStream}
              remoteVideoRef={remoteVideoRef}
              peer={session.peer}
              connection={session.connection}
              camOn={session.camOn}
              micOn={session.micOn}
              remoteBlurred={guard.blurred}
              onUnblur={guard.dismiss}
            >
              {searching ? (
                <MatchmakingOverlay
                  tier={session.tier}
                  poolSize={session.poolSize}
                  interests={selected}
                />
              ) : null}
            </VideoStage>
          ) : (
            <div className="relative grid size-full place-items-center bg-[var(--surface-sunken)] lg:rounded-[var(--radius-xl)]">
              {searching ? (
                <MatchmakingOverlay
                  tier={session.tier}
                  poolSize={session.poolSize}
                  interests={selected}
                />
              ) : (
                <div className="px-6 text-center">
                  <Avatar
                    name={session.peer?.displayName ?? "stranger"}
                    size={72}
                    className="mx-auto"
                  />
                  <p className="mt-4 text-base font-medium">
                    {session.peer?.displayName}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {session.chatReady
                      ? "Say something to get started"
                      : "Opening a direct connection…"}
                  </p>
                </div>
              )}

              {/* Text mode had no connection indicator at all, so a chat that
                  wasn't ready yet looked identical to one that was. */}
              <div className="absolute left-4 top-4">
                <ConnectionPill state={session.connection} />
              </div>
            </div>
          )}

          {/* Clears the home indicator / gesture bar on iOS and Android. */}
          <div className="absolute inset-x-0 bottom-0 z-[var(--z-controls)] flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-4">
            <ControlBar
              micOn={session.micOn}
              camOn={session.camOn}
              videoMode={mode === "video"}
              chatOpen={chatOpen}
              inCall={inCall}
              unreadCount={unread}
              onToggleMic={session.toggleMic}
              onToggleCam={session.toggleCam}
              onToggleChat={() => setChatOpen((o) => !o)}
              onNext={session.next}
              onStop={session.stop}
              onReport={() => setReportOpen(true)}
              onBlock={session.block}
            />
          </div>
        </div>

        {/* Desktop: a persistent rail. Mobile: a sheet, because a 360px rail on
            a phone leaves nothing for the video. */}
        <aside
          className={cn(
            "w-[var(--chat-rail-width)] shrink-0 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)]",
            "hidden lg:block",
            !chatOpen && "lg:hidden",
          )}
        >
          <ChatPanel
            messages={session.messages}
            peerTyping={session.peerTyping}
            peerName={session.peer?.displayName ?? null}
            disabled={!inCall}
            ready={session.chatReady}
            onSend={session.send}
            onTyping={session.setTyping}
          />
        </aside>
      </div>

      {/* Mobile chat is a flex sibling, not an overlay.
          It previously sat `fixed` over the bottom 55% of the screen, which
          covered the control bar entirely — so with chat open you could not
          skip, mute, or leave. Docking it here shrinks the video instead, and
          every control stays reachable. */}
      {chatOpen ? (
        <section
          className={cn(
            "lg:hidden",
            "h-[42dvh] shrink-0 overflow-hidden border-t border-[var(--border)]",
            "[animation:slide-up_var(--dur-base)_var(--ease-out)]",
          )}
          aria-label="Chat"
        >
          <ChatPanel
            messages={session.messages}
            peerTyping={session.peerTyping}
            peerName={session.peer?.displayName ?? null}
            disabled={!inCall}
            ready={session.chatReady}
            onSend={session.send}
            onTyping={session.setTyping}
            onClose={() => setChatOpen(false)}
          />
        </section>
      ) : null}

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        peerName={session.peer?.displayName ?? null}
        captureFrame={guard.captureFrame}
        onSubmit={handleReport}
      />
    </main>
  );
}

/* -------------------------------------------------------------------------- */

function AgeGate({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [pending, setPending] = useState(false);

  return (
    <main id="main" className="relative grid min-h-dvh place-items-center px-5">
      <div className="aurora pointer-events-none absolute inset-0" aria-hidden />
      <Card className="relative w-full max-w-md">
        <CardBody className="p-7">
          <h1 className="text-xl font-semibold tracking-tight">
            Before you start
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
            {brand.name} is for adults. You&rsquo;ll be connected to strangers on
            camera, and conversations are not recorded — which also means we
            can&rsquo;t retrieve them.
          </p>

          <ul className="mt-5 space-y-2 text-sm text-[var(--text-muted)]">
            <li>• You must be {brand.minimumAge} or older.</li>
            <li>• Nudity and sexual content are not allowed.</li>
            <li>• Reports are reviewed and bans are enforced by device.</li>
          </ul>

          <Button
            className="mt-7 w-full"
            size="lg"
            loading={pending}
            onClick={async () => {
              setPending(true);
              await onConfirm();
              setPending(false);
            }}
          >
            I&rsquo;m {brand.minimumAge} or older — continue
          </Button>

          <p className="mt-4 text-center text-xs text-[var(--text-subtle)]">
            By continuing you accept our{" "}
            <Link href="/terms" className="underline underline-offset-2">
              terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline underline-offset-2">
              privacy policy
            </Link>
            .
          </p>
        </CardBody>
      </Card>
    </main>
  );
}

function CenteredMessage({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-5">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-[var(--surface-raised)]">
          {icon}
        </div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
          {body}
        </p>
        <Button asChild variant="secondary" className="mt-6">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </main>
  );
}
