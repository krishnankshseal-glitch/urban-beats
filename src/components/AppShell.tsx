"use client";

import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { LucideIcon, LogOut } from "lucide-react";
import { PulseMark } from "./PulseMark";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
};

export function AppShell({
  role,
  username,
  navItems,
  children,
}: {
  role: "Admin" | "Teacher";
  username: string;
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-white/5 bg-base-900/60 px-4 py-6 md:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <PulseMark size="sm" />
          <div>
            <p className="font-display text-[10px] uppercase tracking-[0.3em] text-slate-500">
              Urban Beats
            </p>
            <p className="text-sm font-medium text-slate-200">{role} console</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.comingSoon ? "#" : item.href}
                aria-disabled={item.comingSoon}
                className={clsx(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                  active
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                  item.comingSoon && "cursor-default opacity-40 hover:bg-transparent hover:text-slate-400"
                )}
              >
                <Icon size={18} />
                {item.label}
                {item.comingSoon && (
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-500">
                    soon
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-white/5 hover:text-aura-redSoft"
        >
          <LogOut size={18} />
          Log out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex items-center justify-between border-b border-white/5 px-5 py-4 md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <PulseMark size="sm" />
            <span className="font-display text-sm text-slate-200">Urban Beats</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-slate-400">
              Signed in as <span className="text-slate-200">{username}</span>
            </span>
          </div>
        </header>

        <main className="flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="flex justify-around border-t border-white/5 bg-base-900/80 px-2 py-2 backdrop-blur-xl md:hidden">
          {navItems.slice(0, 4).map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.comingSoon ? "#" : item.href}
                className={clsx(
                  "flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[11px]",
                  active ? "text-white" : "text-slate-500",
                  item.comingSoon && "opacity-40"
                )}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
          <button onClick={handleLogout} className="flex flex-col items-center gap-1 px-3 py-1.5 text-[11px] text-slate-500">
            <LogOut size={18} />
            Log out
          </button>
        </nav>
      </div>
    </div>
  );
}
