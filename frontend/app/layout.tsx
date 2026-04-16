import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthProvider } from "@/components/AuthProvider";
import { AppNavigation } from "@/components/AppNavigation";
import { Toaster } from "@/components/ui/sonner";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Log Analyzer | SOC Dashboard",
  description: "Upload logs, review detections, and inspect AI analysis in a modern SecOps dashboard.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        <AuthProvider>
          <Suspense fallback={null}>
            <AppNavigation />
          </Suspense>
          {children}
          <Toaster richColors position="top-right" theme="dark" />
        </AuthProvider>
      </body>
    </html>
  );
}
