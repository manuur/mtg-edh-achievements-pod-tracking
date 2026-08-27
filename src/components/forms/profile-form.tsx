"use client";

import { useState } from "react";
import { useLoadingRouter } from "@/lib/loading-router";
import { ApiClientError, apiRequest } from "@/lib/client-api";
import { Button, Field, inputClass } from "@/components/ui";

export function ProfileForm({ profile }: { profile: { displayName: string; email: string; version: number } }) {
  const router = useLoadingRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  async function submit(formData: FormData) {
    setPending(true); setMessage(undefined); setError(undefined);
    try {
      await apiRequest("/api/v1/profile", { method: "PATCH", body: JSON.stringify({ displayName: formData.get("displayName"), version: profile.version }) });
      setMessage("Profile saved."); router.refresh();
    } catch (cause) { setError(cause instanceof ApiClientError ? cause.message : "Could not save the profile."); }
    finally { setPending(false); }
  }
  return <form action={submit} className="grid gap-5"><Field label="Display name"><input name="displayName" defaultValue={profile.displayName} required maxLength={80} className={inputClass} /></Field><Field label="Google account"><input value={profile.email} readOnly disabled className={inputClass} /></Field><p className="text-xs leading-5 text-stone-500">Your Google identity is fixed after claiming. POD administrators never receive access to this email.</p>{message && <p role="status" className="text-sm text-emerald-300">{message}</p>}{error && <p role="alert" className="text-sm text-red-300">{error}</p>}<Button disabled={pending}>{pending ? "Saving…" : "Save profile"}</Button></form>;
}
