import Link from "next/link";
import { BookOpen, ChevronDown, LayoutDashboard, Plus, Shield, UserCog, UserRound, Users } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import type { UserContext } from "@/lib/auth/server";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/decks", label: "Decks", icon: BookOpen },
];

type SidebarPod = {
  id: string;
  name: string;
  role: "ADMIN" | "EDITOR" | "GUEST";
};

export function AppNav({ context, pods }: { context: UserContext; pods: SidebarPod[] }) {
  const navLinks = context.isSuperuser ? [
    ...links,
    { href: "/admin/users", label: "Users", icon: UserCog },
    { href: "/admin/achievements", label: "Achievements", icon: Shield },
  ] : links;
  const mobileLinks = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/decks", label: "Decks", icon: BookOpen },
    { href: "/dashboard#pods", label: "PODs", icon: Users },
    context.isSuperuser
      ? { href: "/admin/users", label: "Admin", icon: Shield }
      : { href: "/settings/profile", label: "Profile", icon: UserRound },
  ];

  return <>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/8 bg-[var(--nav-background)] p-5 backdrop-blur-xl lg:flex lg:flex-col">
      <Link href="/dashboard" className="flex items-center gap-3"><BrandMark className="size-11" /><div><p className="font-display text-lg font-semibold">EDH Tracker</p><p className="text-[9px] tracking-[.2em] text-stone-500 uppercase">Pod ledger</p></div></Link>
      <div className="mt-10 min-h-0 flex-1 overflow-y-auto pr-1">
        <nav className="grid gap-1">{navLinks.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-stone-400 transition hover:bg-white/7 hover:text-white"><Icon className="size-4" />{label}</Link>)}</nav>
        <details className="group mt-5">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold text-stone-400 transition hover:bg-white/7 hover:text-white [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-3"><Users className="size-4 shrink-0" /><span>PODs</span><span className="rounded-full bg-white/7 px-1.5 py-0.5 text-[9px] font-bold text-stone-500">{pods.length}</span></span>
            <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-1 ml-5 grid gap-1 border-l border-white/8 pl-2">
            {pods.map((pod) => <Link key={pod.id} href={`/pods/${pod.id}`} title={`${pod.name} · ${pod.role}`} className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-xs text-stone-500 transition hover:bg-white/6 hover:text-white">
              <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-violet-400/12 font-display text-[11px] font-semibold text-violet-200">{pod.name.charAt(0).toUpperCase()}</span>
              <span className="truncate">{pod.name}</span>
            </Link>)}
            {pods.length === 0 && <p className="px-2 py-2 text-xs leading-5 text-stone-600">No joined PODs yet.</p>}
            <Link href="/pods/new" className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-amber-300/80 transition hover:bg-amber-300/8 hover:text-amber-200"><Plus className="size-3.5" />Create POD</Link>
          </div>
        </details>
      </div>
      <div className="mt-5 grid gap-3"><ThemeToggle initialPreference={context.player.themePreference} initialVersion={context.player.version} /><div className="rounded-2xl border border-white/8 bg-white/4 p-3">
        <Link href="/settings/profile" className="flex items-center gap-3 rounded-lg hover:bg-white/5"><span className="grid size-9 place-items-center rounded-full bg-violet-400/15 text-xs font-bold text-violet-200">{initials(context.player.displayName)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{context.player.displayName}</p><p className="truncate text-xs text-stone-500">Profile settings</p></div></Link>
        <SignOutButton />
      </div></div>
    </aside>
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/8 bg-[var(--nav-background)] px-5 backdrop-blur lg:hidden"><Link href="/dashboard" className="flex items-center gap-2 font-display text-lg"><BrandMark className="size-8" />EDH Tracker</Link><div className="flex items-center gap-2"><ThemeToggle initialPreference={context.player.themePreference} initialVersion={context.player.version} variant="icon" /><Link href="/settings/profile" aria-label="Profile settings" className="grid size-9 place-items-center rounded-full bg-violet-400/15 text-xs font-bold text-violet-200">{initials(context.player.displayName)}</Link></div></header>
    <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-4 rounded-2xl border border-white/10 bg-stone-950/92 p-1.5 shadow-2xl backdrop-blur lg:hidden">{mobileLinks.map(({ href, label, icon: Icon }) => <Link key={label} href={href} className={cn("grid place-items-center gap-1 rounded-xl py-2 text-[10px] text-stone-500 hover:bg-white/6 hover:text-white")}><Icon className="size-4" />{label}</Link>)}</nav>
  </>;
}
