"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError, apiRequest } from "@/lib/client-api";
import { Button, Field, inputClass } from "@/components/ui";

export function PodSettingsForm({ pod }: { pod: { id: string; name: string; timezone: string; version: number; archivedAt: Date | string | null } }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function save(formData: FormData) {
    setPending(true); setError(undefined);
    try {
      await apiRequest(`/api/v1/pods/${pod.id}`, { method: "PATCH", body: JSON.stringify({ name: formData.get("name"), timezone: formData.get("timezone"), version: pod.version }) });
      router.refresh();
    } catch (cause) { setError(cause instanceof ApiClientError ? cause.message : "Could not update the POD."); }
    finally { setPending(false); }
  }
  async function archive() {
    if (!pod.archivedAt && !window.confirm("Archive this POD? Members immediately lose normal access until it is restored.")) return;
    setPending(true); setError(undefined);
    try {
      await apiRequest(`/api/v1/pods/${pod.id}`, { method: "DELETE", body: JSON.stringify({ version: pod.version, archived: !pod.archivedAt }) });
      if (pod.archivedAt) router.refresh(); else router.push("/dashboard");
    } catch (cause) { setError(cause instanceof ApiClientError ? cause.message : "Could not update the POD."); }
    finally { setPending(false); }
  }
  return <div className="grid gap-8"><form action={save} className="grid gap-5"><Field label="POD name"><input name="name" required defaultValue={pod.name} maxLength={80} className={inputClass} /></Field><Field label="IANA timezone"><input name="timezone" required defaultValue={pod.timezone} maxLength={80} className={inputClass} placeholder="America/Argentina/Buenos_Aires" /></Field>{error && <p role="alert" className="text-sm text-red-300">{error}</p>}<Button disabled={pending}>Save POD</Button></form><div className="border-t border-white/8 pt-6"><h3 className="font-semibold">{pod.archivedAt ? "Restore POD" : "Archive POD"}</h3><p className="mt-1 mb-4 text-xs leading-5 text-stone-500">History remains intact. Archiving removes the POD from normal dashboards and blocks member access.</p><Button type="button" variant={pod.archivedAt ? "secondary" : "danger"} disabled={pending} onClick={archive}>{pod.archivedAt ? "Restore POD" : "Archive POD"}</Button></div></div>;
}
