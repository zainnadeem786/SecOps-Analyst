import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] transition-colors",
  {
    variants: {
      variant: {
        default: "border-sky-400/30 bg-sky-500/15 text-sky-100",
        secondary: "border-violet-400/25 bg-violet-500/15 text-violet-100",
        destructive: "border-rose-400/30 bg-rose-500/15 text-rose-100",
        success: "border-emerald-400/30 bg-emerald-500/15 text-emerald-100",
        outline: "border-white/15 bg-transparent text-slate-200",
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