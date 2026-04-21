import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("rounded-[22px] border border-dashed border-white/10 bg-[#0f1828] px-5 py-10 text-center", className)}>
      <p className="text-base font-medium text-white">{title}</p>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">{description}</p>
      {action ? <div className="mt-5 flex items-center justify-center">{action}</div> : null}
    </div>
  );
}
