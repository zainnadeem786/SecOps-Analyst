import type { Metadata } from "next";

import { AppShell } from "@/components/AppShell";
import { AuthProvider } from "@/components/AuthProvider";
import { Toaster } from "@/components/ui/sonner";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SecOps Analyst | SOC Investigation Workspace",
  description: "Analyst-grade SOC workspace for upload triage, live monitoring, campaign correlation, case management, and executive reporting.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        <AuthProvider>
          <AppShell>{children}</AppShell>
          <Toaster richColors position="top-right" theme="dark" />
        </AuthProvider>
      </body>
    </html>
  );
}
