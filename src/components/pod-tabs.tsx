import Link from "next/link";
import { BarChart3, Settings, Swords, Trophy, Users } from "lucide-react";

export function PodTabs({ podId, isAdmin }: { podId: string; isAdmin: boolean }) {
  const links = [
    { href: `/pods/${podId}`, label: "Overview", icon: BarChart3 },
    { href: `/pods/${podId}/players`, label: "Players", icon: Users },
    { href: `/pods/${podId}/games`, label: "Games", icon: Swords },
    { href: `/pods/${podId}/achievements`, label: "Achievements", icon: Trophy },
    { href: `/pods/${podId}/metrics`, label: "Metrics", icon: BarChart3 },
    ...(isAdmin ? [{ href: `/pods/${podId}/settings`, label: "Settings", icon: Settings }] : []),
  ];
  return <nav className="flex gap-1 overflow-x-auto rounded-xl border border-white/8 bg-white/4 p-1">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-stone-400 hover:bg-white/7 hover:text-white"><Icon className="size-3.5" />{label}</Link>)}</nav>;
}
