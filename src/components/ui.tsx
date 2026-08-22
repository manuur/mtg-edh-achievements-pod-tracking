import Link from "next/link";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Button({ className, variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const variants = {
    primary: "bg-amber-300 text-stone-950 hover:bg-amber-200 shadow-[0_8px_24px_rgba(251,191,36,.2)]",
    secondary: "border border-white/12 bg-white/7 text-stone-100 hover:bg-white/12",
    ghost: "text-stone-300 hover:bg-white/8 hover:text-white",
    danger: "border border-red-400/25 bg-red-400/10 text-red-200 hover:bg-red-400/18",
  };
  return <button className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-45", variants[variant], className)} {...props} />;
}

export function LinkButton({ href, children, className, variant = "primary" }: { href: string; children: ReactNode; className?: string; variant?: "primary" | "secondary" | "ghost" }) {
  const variants = {
    primary: "bg-amber-300 text-stone-950 hover:bg-amber-200",
    secondary: "border border-white/12 bg-white/7 text-stone-100 hover:bg-white/12",
    ghost: "text-stone-300 hover:bg-white/8 hover:text-white",
  };
  return <Link href={href} className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition", variants[variant], className)}>{children}</Link>;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-white/9 bg-stone-950/55 shadow-[0_20px_80px_rgba(0,0,0,.18)] backdrop-blur", className)} {...props} />;
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "amber" | "green" | "violet" | "red"; className?: string }) {
  const tones = {
    neutral: "border-white/10 bg-white/6 text-stone-300",
    amber: "border-amber-300/20 bg-amber-300/10 text-amber-200",
    green: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200",
    violet: "border-violet-300/20 bg-violet-300/10 text-violet-200",
    red: "border-red-300/20 bg-red-300/10 text-red-200",
  };
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-[.12em] uppercase", tones[tone], className)}>{children}</span>;
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <label className="grid gap-2 text-sm font-medium text-stone-300"><span>{label}</span>{children}{error && <span className="text-xs text-red-300">{error}</span>}</label>;
}

export const inputClass = "h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3.5 text-sm text-white outline-none transition placeholder:text-stone-600 focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/10";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div>{eyebrow && <p className="mb-2 text-xs font-bold tracking-[.2em] text-amber-300 uppercase">{eyebrow}</p>}<h1 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">{description}</p>}</div>{action}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <Card className="grid min-h-56 place-items-center p-8 text-center"><div><div className="mx-auto mb-4 grid size-12 place-items-center rounded-full border border-amber-300/20 bg-amber-300/8 text-2xl">✦</div><h2 className="text-lg font-semibold text-white">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-400">{description}</p>{action && <div className="mt-5">{action}</div>}</div></Card>;
}
