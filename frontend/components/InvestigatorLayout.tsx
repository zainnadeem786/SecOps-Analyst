import type { ReactNode } from "react";

interface InvestigatorLayoutProps {
  overviewPanel: ReactNode;
  summaryPanel: ReactNode;
  flowPanel: ReactNode;
  evidencePanel: ReactNode;
  logPanel: ReactNode;
}

export function InvestigatorLayout({
  overviewPanel,
  summaryPanel,
  flowPanel,
  evidencePanel,
  logPanel,
}: InvestigatorLayoutProps) {
  return (
    <section className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_340px] xl:items-start">
        <div>{overviewPanel}</div>
        <div className="space-y-6">
          {summaryPanel}
        </div>
      </div>
      <div>
        {flowPanel}
      </div>
      <div>
        {evidencePanel}
      </div>
      <div>
        {logPanel}
      </div>
    </section>
  );
}
