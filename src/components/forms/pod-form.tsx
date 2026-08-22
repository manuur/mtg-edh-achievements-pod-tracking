"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiClientError, apiRequest } from "@/lib/client-api";
import { Button, Field, inputClass } from "@/components/ui";

export function PodForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(formData: FormData) {
    setPending(true); setError(undefined);
    try {
      const pod = await apiRequest<{ id: string }>("/api/v1/pods", { method: "POST", body: JSON.stringify({ name: formData.get("name"), timezone: formData.get("timezone") }) });
      router.push(`/pods/${pod.id}`); router.refresh();
    } catch (cause) { setError(cause instanceof ApiClientError ? cause.message : "Could not create the POD."); setPending(false); }
  }

  return <form action={submit} className="grid gap-5"><Field label="POD name"><input name="name" required minLength={2} maxLength={80} className={inputClass} placeholder="The Sunday Pod" /></Field><Field label="Timezone"><select name="timezone" defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone} className={inputClass}><option value="America/Argentina/Buenos_Aires">Buenos Aires</option><option value="America/New_York">New York</option><option value="America/Los_Angeles">Los Angeles</option><option value="Europe/London">London</option><option value="UTC">UTC</option></select></Field>{error && <p role="alert" className="text-sm text-red-300">{error}</p>}<Button disabled={pending} type="submit">{pending ? "Creating…" : "Create POD"}</Button></form>;
}
