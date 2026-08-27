import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { BrandMark } from "@/components/brand-mark";
import { Card } from "@/components/ui";
import { isDevAuthEnabled } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <main className="grid min-h-screen place-items-center px-5 py-12"><div className="w-full max-w-md"><Link href="/" className="mb-8 flex items-center justify-center gap-2 text-sm text-stone-400 hover:text-white">← EDH Pod Tracker</Link><Card className="p-7 sm:p-9"><div className="mb-8 text-center"><BrandMark className="mx-auto mb-5 size-20" /><h1 className="font-display text-3xl">Take your seat</h1><p className="mt-2 text-sm leading-6 text-stone-400">Your Google account securely links you to every private POD you belong to.</p></div><GoogleSignIn devBypass={isDevAuthEnabled()} /><div className="mt-6 flex items-start gap-3 border-t border-white/8 pt-5 text-xs leading-5 text-stone-500"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-300" /><p>POD data is private. Signing in never makes your profile or results publicly searchable.</p></div></Card></div></main>;
}
