"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "../lib/cn";

type Tone = "info" | "success" | "warning" | "danger";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: Tone;
  durationMs: number;
}

interface ToastContextValue {
  toast: (t: {
    title: string;
    description?: string;
    tone?: Tone;
    durationMs?: number;
  }) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const TONE_ICON: Record<Tone, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

const TONE_CLASS: Record<Tone, string> = {
  info: "text-[var(--accent)]",
  success: "text-[var(--success)]",
  warning: "text-[var(--warning)]",
  danger: "text-[var(--danger)]",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(1);

  const toast = React.useCallback<ToastContextValue["toast"]>(
    ({ title, description, tone = "info", durationMs = 5000 }) => {
      setItems((prev) => [
        ...prev,
        { id: nextId.current++, title, description, tone, durationMs },
      ]);
    },
    [],
  );

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}

        {items.map((item) => {
          const Icon = TONE_ICON[item.tone];
          return (
            <ToastPrimitive.Root
              key={item.id}
              duration={item.durationMs}
              onOpenChange={(open) => {
                if (!open)
                  setItems((prev) => prev.filter((t) => t.id !== item.id));
              }}
              className={cn(
                "flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border)]",
                "bg-[var(--surface-raised)] p-4 shadow-[var(--shadow-lg)]",
                "data-[state=open]:[animation:slide-in-right_var(--dur-base)_var(--ease-out)]",
                "data-[state=closed]:[animation:fade-out_var(--dur-fast)_var(--ease-out)]",
                "data-[swipe=end]:animate-none data-[swipe=move]:transition-none",
              )}
              style={{
                transform: "translateX(var(--radix-toast-swipe-move-x, 0))",
              }}
            >
              <Icon className={cn("mt-0.5 size-5 shrink-0", TONE_CLASS[item.tone])} />
              <div className="min-w-0 flex-1">
                <ToastPrimitive.Title className="text-sm font-semibold text-[var(--text)]">
                  {item.title}
                </ToastPrimitive.Title>
                {item.description ? (
                  <ToastPrimitive.Description className="mt-0.5 text-sm leading-relaxed text-[var(--text-muted)]">
                    {item.description}
                  </ToastPrimitive.Description>
                ) : null}
              </div>
              <ToastPrimitive.Close
                className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}

        <ToastPrimitive.Viewport
          className={cn(
            "fixed bottom-0 right-0 z-[var(--z-toast)] flex w-full max-w-sm flex-col gap-2",
            // Clears the in-call control bar on mobile, where the bar is docked
            // to the bottom edge and would otherwise be covered.
            "p-4 pb-[calc(1rem+var(--control-bar-height)+env(safe-area-inset-bottom))]",
            "sm:pb-4",
            "outline-none",
          )}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
