"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiClientError, apiRequest } from "@/lib/client-api";
import { Button, Field, inputClass } from "@/components/ui";

export function MemberForm({ podId }: { podId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(formData: FormData) {
    setPending(true); setError(undefined);
    try {
      await apiRequest(`/api/v1/pods/${podId}/members`, { method: "POST", body: JSON.stringify({ displayName: formData.get("displayName"), email: formData.get("email"), role: formData.get("role") }) });
      router.refresh();
    } catch (cause) { setError(cause instanceof ApiClientError ? cause.message : "Could not add the player."); }
    finally { setPending(false); }
  }
  return <form action={submit} className="grid gap-4"><Field label="Display name"><input name="displayName" required maxLength={80} className={inputClass} placeholder="Player name" /></Field><Field label="Google email · optional"><input name="email" type="email" className={inputClass} placeholder="player@gmail.com" /></Field><Field label="Starting role"><select name="role" defaultValue="GUEST" className={inputClass}><option value="GUEST">Guest</option><option value="EDITOR">Editor (claimed accounts only)</option><option value="ADMIN">Administrator (claimed accounts only)</option></select></Field>{error && <p role="alert" className="text-sm text-red-300">{error}</p>}<Button disabled={pending}>{pending ? "Adding…" : "Add player"}</Button></form>;
}

export function MemberActions({ podId, playerId, role, status, claimed, version }: { podId: string; playerId: string; role: string; status: string; claimed: boolean; version: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [claimEmail, setClaimEmail] = useState("");
  async function update(nextRole?: string, archive = false, restore = false) {
    setPending(true); setError(undefined);
    try {
      await apiRequest(`/api/v1/pods/${podId}/members/${playerId}`, { method: archive ? "DELETE" : "PATCH", body: JSON.stringify(archive ? { version } : restore ? { status: "ACTIVE", version } : { role: nextRole, version }) });
      router.refresh();
    } catch (cause) { setError(cause instanceof ApiClientError ? cause.message : "Update failed."); }
    finally { setPending(false); }
  }
  async function associateEmail() {
    if (!claimEmail) return;
    setPending(true); setError(undefined);
    try { await apiRequest(`/api/v1/pods/${podId}/members/${playerId}`, { method: "PATCH", body: JSON.stringify({ claimEmail, version }) }); setClaimEmail(""); router.refresh(); }
    catch (cause) { setError(cause instanceof ApiClientError ? cause.message : "Could not associate the email."); }
    finally { setPending(false); }
  }
  return <div><div className="flex items-center gap-2"><select aria-label="Player role" disabled={pending || status !== "ACTIVE"} value={role} onChange={(event) => update(event.target.value)} className="h-8 rounded-lg border border-white/10 bg-stone-900 px-2 text-xs"><option value="GUEST">Guest</option><option value="EDITOR">Editor</option><option value="ADMIN">Admin</option></select>{status === "ACTIVE" ? <button disabled={pending} onClick={() => update(undefined, true)} className="rounded-lg px-2 py-1.5 text-xs text-red-300 hover:bg-red-400/10">Remove</button> : <button disabled={pending} onClick={() => update(undefined, false, true)} className="rounded-lg px-2 py-1.5 text-xs text-emerald-300 hover:bg-emerald-400/10">Restore</button>}</div>{!claimed && <div className="mt-2 flex gap-1"><input aria-label="Google claim email" type="email" value={claimEmail} onChange={(event) => setClaimEmail(event.target.value)} placeholder="Google email" className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-stone-900 px-2 text-xs" /><button disabled={pending || !claimEmail} onClick={associateEmail} className="rounded-lg px-2 text-xs text-amber-200 hover:bg-amber-300/10">Set</button></div>}{error && <p role="alert" className="mt-1 text-xs text-red-300">{error}</p>}</div>;
}
