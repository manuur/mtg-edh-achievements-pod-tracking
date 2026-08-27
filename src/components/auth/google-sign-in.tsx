"use client";

import { useState } from "react";
import { useLoadingRouter } from "@/lib/loading-router";
import { authClient } from "@/lib/auth/client";
import { withGlobalLoading } from "@/lib/loading";
import { Button } from "@/components/ui";

export function GoogleSignIn({ devBypass = false }: { devBypass?: boolean }) {
  const router = useLoadingRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function signIn() {
    if (devBypass) {
      router.push("/dashboard");
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await withGlobalLoading(
        () => authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" }),
        "Opening Google…",
      );
    } catch {
      setError("Google sign-in could not start. Check the Neon Auth configuration.");
      setPending(false);
    }
  }

  return <div className="grid gap-3"><Button onClick={signIn} disabled={pending} className="w-full">{pending ? "Opening Google…" : devBypass ? "Enter local workspace" : "Continue with Google"}</Button>{error && <p role="alert" className="text-sm text-red-300">{error}</p>}</div>;
}
