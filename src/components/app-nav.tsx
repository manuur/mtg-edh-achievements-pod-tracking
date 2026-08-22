import Link from "next/link";
import { BookOpen, LayoutDashboard, LogOut, Shield, UserRound, Users } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import type { UserContext } from "@/lib/auth/server";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/decks", label: "Decks", icon: BookOpen },
];

export function AppNav({ context }: { context: UserContext }) {
  const navLinks = context.isSuperuser ? [...links, { href: "/admin/achievements", label: "Catalog", icon: Shield }] : links;
  const mobileLinks = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/decks", label: "Decks", icon: BookOpen },
    { href: "/dashboard#pods", label: "PODs", icon: Users },
    context.isSuperuser
      ? { href: "/admin/achievements", label: "Catalog", icon: Shield }
      : { href: "/settings/profile", label: "Profile", icon: UserRound },
  ];

  return <>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/8 bg-[#0b0a08]/90 p-5 backdrop-blur-xl lg:flex lg:flex-col">
      <Link href="/dashboard" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl border border-amber-300/25 bg-amber-300/10 text-amber-200">✦</span><div><p className="font-display text-lg font-semibold">EDH Tracker</p><p className="text-[9px] tracking-[.2em] text-stone-500 uppercase">Pod ledger</p></div></Link>
      <nav className="mt-10 grid gap-1">{navLinks.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-stone-400 transition hover:bg-white/7 hover:text-white"><Icon className="size-4" />{label}</Link>)}</nav>
      <div className="mt-auto rounded-2xl border border-white/8 bg-white/4 p-3">
        <Link href="/settings/profile" className="flex items-center gap-3 rounded-lg hover:bg-white/5"><span className="grid size-9 place-items-center rounded-full bg-violet-400/15 text-xs font-bold text-violet-200">{initials(context.player.displayName)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{context.player.displayName}</p><p className="truncate text-xs text-stone-500">Profile settings</p></div></Link>
        <form action="/api/auth/sign-out" method="post" className="mt-3"><button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-stone-500 hover:bg-white/6 hover:text-white"><LogOut className="size-3.5" />Sign out</button></form>
      </div>
    </aside>
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/8 bg-[#0b0a08]/85 px-5 backdrop-blur lg:hidden"><Link href="/dashboard" className="font-display text-lg">✦ EDH Tracker</Link><Link href="/settings/profile" aria-label="Profile settings" className="grid size-9 place-items-center rounded-full bg-violet-400/15 text-xs font-bold text-violet-200">{initials(context.player.displayName)}</Link></header>
    <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-4 rounded-2xl border border-white/10 bg-stone-950/92 p-1.5 shadow-2xl backdrop-blur lg:hidden">{mobileLinks.map(({ href, label, icon: Icon }) => <Link key={label} href={href} className={cn("grid place-items-center gap-1 rounded-xl py-2 text-[10px] text-stone-500 hover:bg-white/6 hover:text-white")}><Icon className="size-4" />{label}</Link>)}</nav>
  </>;
}
