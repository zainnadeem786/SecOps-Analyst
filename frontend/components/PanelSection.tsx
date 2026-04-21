import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PanelSectionProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function PanelSection({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: PanelSectionProps) {
  return (
    <section className={cn("rounded-[24px] border border-white/8 bg-[#0b1422] shadow-[0_14px_36px_rgba(2,6,23,0.18)]", className)}>
      <div className="flex flex-col gap-3 border-b border-white/8 px-5 py-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {description ? <p className="mt-2 max-w-[70ch] text-sm leading-6 text-slate-400">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
      <div className={cn("px-5 py-4", contentClassName)}>{children}</div>
    </section>
  );
}
