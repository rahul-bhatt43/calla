"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "../lib/cn";

/* -------------------------------------------------------------------------- */

export const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "text-sm font-medium text-[var(--text)] leading-none",
      "peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";

/* -------------------------------------------------------------------------- */

const inputBase = [
  "w-full rounded-[var(--radius-md)] bg-[var(--surface-sunken)]",
  "border border-[var(--border)] px-3 text-sm text-[var(--text)]",
  "transition-[border-color,box-shadow] duration-[var(--dur-fast)]",
  "hover:border-[var(--border-strong)]",
  "focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-ring)]",
  "disabled:cursor-not-allowed disabled:opacity-60",
  "aria-[invalid=true]:border-[var(--danger)] aria-[invalid=true]:ring-[var(--danger)]/30",
].join(" ");

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(inputBase, "h-10", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(inputBase, "min-h-20 resize-y py-2 leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

/* -------------------------------------------------------------------------- */

export interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wires label, hint and error to the control via aria-describedby so screen
 * readers announce validation failures. The error is a live region: it appears
 * after submit, and without one it would go unannounced entirely.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: FieldProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="ml-0.5 text-[var(--danger)]" aria-hidden>
            *
          </span>
        ) : null}
      </Label>

      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<any>, {
            id: htmlFor,
            "aria-describedby":
              [hintId, errorId].filter(Boolean).join(" ") || undefined,
            "aria-invalid": error ? true : undefined,
            "aria-required": required || undefined,
          })
        : children}

      {hint && !error ? (
        <p id={hintId} className="text-xs text-[var(--text-subtle)]">
          {hint}
        </p>
      ) : null}

      <p
        id={errorId}
        role="alert"
        aria-live="polite"
        className={cn(
          "text-xs text-[var(--danger)]",
          error ? "block" : "sr-only",
        )}
      >
        {error ?? ""}
      </p>
    </div>
  );
}
