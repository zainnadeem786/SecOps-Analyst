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
      <div>{overviewPanel}</div>
      <div>{summaryPanel}</div>
      <div>{flowPanel}</div>
      <div>{evidencePanel}</div>
      <div>{logPanel}</div>
    </section>
  );
}
