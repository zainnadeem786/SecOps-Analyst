"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";

import { CommandBar } from "@/components/CommandBar";
import { SidebarNav } from "@/components/SidebarNav";

const shelllessPrefixes = ["/login", "/register", "/share/"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const useShell = pathname ? !shelllessPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix)) : true;

  if (!useShell) {
    return (
      <div className="min-h-screen bg-[#060c15] text-slate-100">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060c15] text-slate-100">
      <div className="xl:grid xl:min-h-screen xl:grid-cols-[minmax(0,1fr)_248px]">
        <div className="min-w-0">
          <Suspense fallback={<div className="h-[76px] border-b border-white/8 bg-[#07101c]/96" />}>
            <CommandBar />
          </Suspense>
          <main className="mx-auto w-full max-w-[1680px] px-4 py-4 sm:px-6 lg:px-8 xl:pr-6 2xl:pr-8">
            {children}
          </main>
        </div>
        <SidebarNav pathname={pathname} />
      </div>
    </div>
  );
}
