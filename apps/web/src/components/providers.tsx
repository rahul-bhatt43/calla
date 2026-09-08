"use client";

import { ToastProvider, TooltipProvider } from "@callme/ui";

/**
 * Mounted by the chat route only, not the root layout.
 *
 * These two contexts pull in the Radix toast and tooltip runtimes. Nothing on
 * the marketing or SEO pages uses either, and putting them in the root layout
 * would add their client bundles to every statically rendered page on the site.
 */
export function ChatProviders({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={400}>
      <ToastProvider>{children}</ToastProvider>
    </TooltipProvider>
  );
}
