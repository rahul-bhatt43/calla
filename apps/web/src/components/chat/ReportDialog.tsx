"use client";

import { useState } from "react";
import { REPORT_REASONS, type ReportReason } from "@callme/protocol";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Textarea,
  cn,
} from "@callme/ui";

const REASON_COPY: Record<ReportReason, { label: string; hint: string }> = {
  nudity: { label: "Nudity or sexual content", hint: "Explicit content on camera" },
  minor: {
    label: "This person appears to be a minor",
    hint: "Acted on immediately",
  },
  harassment: { label: "Harassment or hate", hint: "Abuse, slurs, threats" },
  violence: { label: "Violence or self-harm", hint: "Graphic or dangerous content" },
  spam: { label: "Spam or advertising", hint: "Bots, links, promotion" },
  other: { label: "Something else", hint: "Tell us what happened" },
};

export function ReportDialog({
  open,
  onOpenChange,
  peerName,
  captureFrame,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  peerName: string | null;
  /** Grabs the current remote frame as base64 JPEG, if there is one. */
  captureFrame: () => string | null;
  onSubmit: (reason: ReportReason, note: string, evidence?: string) => void;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [attach, setAttach] = useState(true);

  const submit = () => {
    if (!reason) return;
    const evidence = attach ? (captureFrame() ?? undefined) : undefined;
    onSubmit(reason, note, evidence);
    onOpenChange(false);
    setReason(null);
    setNote("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Report {peerName ?? "this person"}</DialogTitle>
        <DialogDescription>
          You&rsquo;ll be disconnected and never matched with them again. Reports
          are reviewed by a human.
        </DialogDescription>

        <fieldset className="mt-5 space-y-2">
          <legend className="sr-only">Reason for reporting</legend>
          {REPORT_REASONS.map((r) => {
            const selected = reason === r;
            return (
              <label
                key={r}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-3",
                  "transition-colors duration-[var(--dur-fast)]",
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent-subtle)]"
                    : "border-[var(--border)] hover:border-[var(--border-strong)]",
                )}
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r}
                  checked={selected}
                  onChange={() => setReason(r)}
                  className="mt-0.5 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {REASON_COPY[r].label}
                  </span>
                  <span className="block text-xs text-[var(--text-subtle)]">
                    {REASON_COPY[r].hint}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="mt-4 space-y-3">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="Anything else we should know? (optional)"
            aria-label="Additional details"
          />

          {/* Opt-out rather than opt-in: a still frame is what makes a report
              actionable, and asking after the fact is too late — the call is
              already over. Stated plainly so it is never a surprise. */}
          <label className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={attach}
              onChange={(e) => setAttach(e.target.checked)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            Attach a snapshot of their video as evidence
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} disabled={!reason}>
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
