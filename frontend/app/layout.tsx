import type { Metadata } from "next";

import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Log Analyzer | SOC Dashboard",
  description: "Upload logs, review detections, and inspect AI analysis in a modern SecOps dashboard.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        {children}
        <Toaster richColors position="top-right" theme="dark" />
      </body>
    </html>
  );
}