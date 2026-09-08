"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Badge, cn } from "@callme/ui";
import type { Tier } from "@callme/protocol";

const TIER_COPY: Record<Tier, string> = {
  interest: "Looking for someone who shares your interests",
  language: "Widening the search to everyone speaking your language",
  global: "Searching everywhere",
};

export function MatchmakingOverlay({
  tier,
  poolSize,
  interests,
}: {
  tier: Tier | null;
  poolSize: number;
  interests: string[];
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    // Sits above the video but BELOW the control bar (z-controls). At
    // z-overlay it covered the controls, so a user stuck in a long search
    // could not skip, change settings, or leave.
    <div className="absolute inset-0 z-[var(--z-sticky)] grid place-items-center">
      <div className="aurora absolute inset-0" aria-hidden />

      <div className="relative flex flex-col items-center gap-6 px-6 text-center">
        {/* Expanding rings rather than a spinner: a spinner reads as "loading,
            please wait", while this reads as "reaching outward", which is
            actually what the widening tier search is doing. */}
        <div className="relative grid size-24 place-items-center">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden
              className="absolute inset-0 rounded-full border border-[var(--accent)]"
              style={{
                animation: "pulse-ring 2.4s ease-out infinite",
                animationDelay: `${i * 0.8}s`,
              }}
            />
          ))}
          <span className="relative grid size-16 place-items-center rounded-full bg-[var(--accent-subtle)]">
            <Users className="size-7 text-[var(--accent)]" aria-hidden />
          </span>
        </div>

        <div className="space-y-2" aria-live="polite">
          <h2 className="text-xl font-semibold tracking-tight">
            Finding someone…
          </h2>
          <p className="max-w-sm text-sm text-[var(--text-muted)]">
            {tier ? TIER_COPY[tier] : "Getting you connected"}
            {elapsed > 3 ? ` · ${elapsed}s` : ""}
          </p>
        </div>

        {interests.length > 0 && tier === "interest" ? (
          <div className="flex flex-wrap justify-center gap-1.5">
            {interests.slice(0, 6).map((i) => (
              <Badge key={i} tone="accent">
                {i.replace(/-/g, " ")}
              </Badge>
            ))}
          </div>
        ) : null}

        {/* poolSize is the queue length including you, so the number of *other*
            people waiting is one fewer. */}
        {poolSize > 1 ? (
          <p className="text-xs text-[var(--text-subtle)]">
            {(poolSize - 1).toLocaleString()}{" "}
            {poolSize - 1 === 1 ? "other person" : "others"} waiting right now
          </p>
        ) : null}

        <div
          className={cn(
            "mt-2 h-1 w-48 overflow-hidden rounded-full bg-[var(--surface-raised)]",
          )}
          aria-hidden
        >
          <div className="h-full w-1/3 rounded-full bg-[var(--accent)] [animation:shimmer_1.6s_ease-in-out_infinite] bg-[linear-gradient(90deg,transparent,var(--accent),transparent)] bg-[length:200%_100%]" />
        </div>
      </div>
    </div>
  );
}
