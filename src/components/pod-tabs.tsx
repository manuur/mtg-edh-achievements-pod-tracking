"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ChevronDown, Settings, Swords, Trophy, Users } from "lucide-react";
import { useLoadingRouter } from "@/lib/loading-router";
import { cn } from "@/lib/utils";

export function PodTabs({ podId, isAdmin }: { podId: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const router = useLoadingRouter();
  const overviewHref = `/pods/${podId}`;
  const links = [
    { href: overviewHref, label: "Overview", icon: BarChart3 },
    { href: `${overviewHref}/players`, label: "Players", icon: Users },
    { href: `${overviewHref}/games`, label: "Games", icon: Swords },
    { href: `${overviewHref}/achievements`, label: "Achievements", icon: Trophy },
    { href: `${overviewHref}/metrics`, label: "Metrics", icon: BarChart3 },
    ...(isAdmin ? [{ href: `${overviewHref}/settings`, label: "Settings", icon: Settings }] : []),
  ];
  const activeLink = links.find((link) => link.href === overviewHref
    ? pathname === link.href
    : pathname === link.href || pathname.startsWith(`${link.href}/`)) ?? links[0];
  const ActiveIcon = activeLink.icon;

  return <div className="w-full min-w-0 sm:w-auto sm:max-w-full">
    <div className="relative sm:hidden">
      <ActiveIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-amber-300" />
      <select
        aria-label="POD section"
        value={activeLink.href}
        onChange={(event) => {
          if (event.target.value !== activeLink.href) router.push(event.target.value);
        }}
        className="h-12 w-full appearance-none truncate rounded-xl border border-white/10 bg-black/20 pr-10 pl-10 text-sm font-semibold text-stone-200 outline-none transition focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/10"
      >
        {links.map((link) => <option key={link.href} value={link.href}>{link.label}</option>)}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-stone-500" />
    </div>

    <nav aria-label="POD sections" className="hidden max-w-full gap-1 overflow-x-auto rounded-xl border border-white/8 bg-white/4 p-1 sm:flex">
      {links.map(({ href, label, icon: Icon }) => {
        const isActive = href === activeLink.href;
        return <Link
          key={href}
          href={href}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition",
            isActive ? "bg-amber-300/12 text-amber-200" : "text-stone-400 hover:bg-white/7 hover:text-white",
          )}
        >
          <Icon aria-hidden="true" className="size-3.5" />
          {label}
        </Link>;
      })}
    </nav>
  </div>;
}
