"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/cn";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium",
    "select-none rounded-[var(--radius-md)]",
    "transition-[background-color,border-color,color,box-shadow,transform]",
    "duration-[var(--dur-fast)] ease-[var(--ease-out)]",
    "active:scale-[0.985]",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--accent)] text-[var(--accent-fg)] shadow-[var(--shadow-sm)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)]",
        secondary:
          "bg-[var(--surface-raised)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]/80",
        outline:
          "border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface)]",
        ghost:
          "text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
        danger:
          "bg-[var(--danger)] text-[var(--danger-fg)] hover:brightness-110 active:brightness-95",
        success:
          "bg-[var(--success)] text-[var(--success-fg)] hover:brightness-110 active:brightness-95",
        link: "text-[var(--accent)] underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-[0.8125rem] [&_svg]:size-4",
        md: "h-10 px-4 text-sm [&_svg]:size-4",
        lg: "h-12 px-6 text-base [&_svg]:size-5",
        icon: "size-10 [&_svg]:size-4",
        "icon-sm": "size-8 [&_svg]:size-4",
        "icon-lg": "size-12 [&_svg]:size-5",
      },
      /** Pill shape — used for the floating in-call control bar. */
      pill: {
        true: "rounded-[var(--radius-full)]",
        false: "",
      },
    },
    defaultVariants: { variant: "primary", size: "md", pill: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      pill,
      asChild = false,
      loading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const classes = cn(buttonVariants({ variant, size, pill }), className);

    // asChild merges our props onto the caller's element (usually a <Link>),
    // and Radix's Slot requires exactly one child to merge onto. Rendering the
    // spinner alongside `children` would hand it two — the `null` in the
    // not-loading case counts — so the asChild branch passes children through
    // untouched. A link that needs a spinner should render one itself.
    if (asChild) {
      return (
        <Slot ref={ref} className={classes} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        // Announce the pending state rather than silently swapping the icon.
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            <span className="sr-only">Loading</span>
          </>
        ) : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
