import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <section className={cn("rounded-[26px] border border-white/8 bg-[#0b1422] px-6 py-6 shadow-[0_18px_48px_rgba(2,6,23,0.22)] sm:px-7 sm:py-7", className)}>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">{eyebrow}</p>
          ) : null}
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
          <p className="mt-3 max-w-[72ch] text-sm leading-7 text-slate-400">{description}</p>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}
