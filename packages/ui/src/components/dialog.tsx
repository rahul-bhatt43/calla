"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const Overlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[var(--z-overlay)] bg-black/60 backdrop-blur-sm",
      "data-[state=open]:[animation:fade-in_var(--dur-base)_var(--ease-out)]",
      "data-[state=closed]:[animation:fade-out_var(--dur-fast)_var(--ease-out)]",
      className,
    )}
    {...props}
  />
));
Overlay.displayName = "DialogOverlay";

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /**
   * On small screens a centred modal fights the keyboard and the notch. `sheet`
   * docks it to the bottom edge instead, which is what the chat panel and the
   * report flow use on mobile.
   */
  variant?: "center" | "sheet";
  showClose?: boolean;
}

export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    { className, children, variant = "center", showClose = true, ...props },
    ref,
  ) => (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed z-[var(--z-modal)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]",
          "focus:outline-none",
          variant === "center" && [
            "left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2",
            "rounded-[var(--radius-xl)] p-6",
            "data-[state=open]:[animation:scale-in_var(--dur-base)_var(--ease-spring)]",
          ],
          variant === "sheet" && [
            "inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[var(--radius-2xl)] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
            "data-[state=open]:[animation:slide-up_var(--dur-base)_var(--ease-out)]",
          ],
          className,
        )}
        {...props}
      >
        {variant === "sheet" ? (
          <div
            aria-hidden
            className="mx-auto mb-4 h-1 w-9 rounded-full bg-[var(--border-strong)]"
          />
        ) : null}

        {children}

        {showClose ? (
          <DialogPrimitive.Close
            className={cn(
              "absolute right-4 top-4 rounded-[var(--radius-sm)] p-1.5",
              "text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text)]",
            )}
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  ),
);
DialogContent.displayName = "DialogContent";

export const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold tracking-tight text-[var(--text)]",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(
      "mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]",
      className,
    )}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}
