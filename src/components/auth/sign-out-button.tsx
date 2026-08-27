"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { withGlobalLoading } from "@/lib/loading";
import { useLoadingRouter } from "@/lib/loading-router";

export function SignOutButton() {
  const router = useLoadingRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function signOut() {
    setPending(true);
    setError(undefined);

    try {
      const result = await withGlobalLoading(() => authClient.signOut(), "Signing out…");
      if (result.error) throw new Error(result.error.message);
      router.replace("/login");
    } catch {
      setError("Sign out failed. Please try again.");
      setPending(false);
    }
  }

  return <div className="mt-3">
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-stone-500 hover:bg-white/6 hover:text-white disabled:cursor-wait disabled:opacity-60"
    >
      <LogOut className="size-3.5" />
      {pending ? "Signing out…" : "Sign out"}
    </button>
    {error && <p role="alert" className="mt-1 px-2 text-xs text-red-300">{error}</p>}
  </div>;
}
