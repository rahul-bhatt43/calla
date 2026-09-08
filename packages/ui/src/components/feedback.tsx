"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/cn";

/* -------------------------------------------------------------------------- */
/* Badge                                                                       */
/* -------------------------------------------------------------------------- */

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[var(--radius-full)] px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral:
          "bg-[var(--surface-raised)] text-[var(--text-muted)] border border-[var(--border)]",
        accent: "bg-[var(--accent-subtle)] text-[var(--accent)]",
        success: "bg-[var(--success-subtle)] text-[var(--success)]",
        warning: "bg-[var(--warning-subtle)] text-[var(--warning)]",
        danger: "bg-[var(--danger-subtle)] text-[var(--danger)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/* -------------------------------------------------------------------------- */
/* Spinner                                                                     */
/* -------------------------------------------------------------------------- */

export function Spinner({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span role="status" aria-live="polite" className="inline-flex">
      <svg
        className={cn("size-5 animate-spin text-[var(--accent)]", className)}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeWidth="2.5"
          className="opacity-20"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeleton                                                                    */
/* -------------------------------------------------------------------------- */

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-[var(--radius-md)] bg-[var(--surface-raised)]",
        // Shimmer rather than opacity-pulse: it reads as "arriving" instead of
        // "broken", and it survives prefers-reduced-motion by simply stopping.
        "bg-[linear-gradient(90deg,var(--surface-raised)_25%,var(--surface)_37%,var(--surface-raised)_63%)]",
        "bg-[length:200%_100%] [animation:shimmer_1.6s_ease-in-out_infinite]",
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Connection quality pill                                                     */
/* -------------------------------------------------------------------------- */

export type ConnectionState =
  | "idle"
  | "searching"
  | "connecting"
  | "connected"
  | "relayed"
  | "poor"
  | "failed";

const CONNECTION_COPY: Record<
  ConnectionState,
  { label: string; tone: BadgeProps["tone"]; pulse: boolean }
> = {
  idle: { label: "Not connected", tone: "neutral", pulse: false },
  searching: { label: "Finding someone…", tone: "accent", pulse: true },
  connecting: { label: "Connecting…", tone: "warning", pulse: true },
  connected: { label: "Connected", tone: "success", pulse: false },
  // Surfaced deliberately: relayed calls are capped in quality, and saying so
  // is better than letting the user assume the app is just bad.
  relayed: { label: "Connected (relayed)", tone: "warning", pulse: false },
  poor: { label: "Weak connection", tone: "warning", pulse: false },
  failed: { label: "Connection failed", tone: "danger", pulse: false },
};

export function ConnectionPill({
  state,
  className,
}: {
  state: ConnectionState;
  className?: string;
}) {
  const { label, tone, pulse } = CONNECTION_COPY[state];
  return (
    <Badge tone={tone} className={className} aria-live="polite">
      <span className="relative flex size-2">
        {pulse ? (
          <span className="absolute inset-0 rounded-full bg-current [animation:pulse-ring_1.8s_ease-out_infinite]" />
        ) : null}
        <span className="relative size-2 rounded-full bg-current" />
      </span>
      {label}
    </Badge>
  );
}
