"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Onboarding } from "./Onboarding";

const NAV = [
  { href: "/", label: "Dashboard", hint: "Portfolio" },
  { href: "/markets", label: "Markets", hint: "Charts" },
  { href: "/journal", label: "Journal", hint: "History" },
  { href: "/settings", label: "Settings", hint: "Risk" },
];

export function AppShell({
  children,
  paperLabel,
}: {
  children: React.ReactNode;
  paperLabel: string;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-40 border-b border-amber/30 bg-[#2a220c] px-4 py-2 text-center text-xs font-semibold tracking-[0.14em] text-amber sm:text-sm">
        {paperLabel}
      </div>
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-tight">Paper Coach</span>
            <span className="hidden text-xs text-mute sm:inline">beginner classroom</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-3 py-1.5 text-sm transition ${
                    active
                      ? "bg-mint-dim text-mint"
                      : "text-mute hover:bg-card-2 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:pb-10">
        {children}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-4">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center py-2.5 text-xs ${
                  active ? "text-mint" : "text-mute"
                }`}
              >
                <span className="font-medium">{item.label}</span>
                <span className="text-[10px] opacity-70">{item.hint}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      <Onboarding />
    </div>
  );
}
