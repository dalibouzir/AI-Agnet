"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border border-transparent px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.28em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] text-[color:var(--text-primary)] focus-visible:ring-[color:var(--color-primary)]",
        accent:
          "border-transparent bg-[color:var(--color-primary)]/15 text-[color:var(--color-primary)] focus-visible:ring-[color:var(--color-primary)]",
        success:
          "border-transparent bg-[color:var(--success)]/15 text-[color:var(--success)] focus-visible:ring-[color:var(--success)]",
        danger:
          "border-transparent bg-[color:var(--danger)]/15 text-[color:var(--danger)] focus-visible:ring-[color:var(--danger)]",
        outline:
          "border-[color:var(--border-subtle)] bg-transparent text-[color:var(--text-primary)] focus-visible:ring-[color:var(--color-primary)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
