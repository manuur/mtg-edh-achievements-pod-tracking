"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { ApiClientError, apiRequest } from "@/lib/client-api";

export function ArchiveGameButton({ podId, gameId, version, archived = false }: { podId: string; gameId: string; version: number; archived?: boolean }) {
  const router = useRouter(); const [pending, setPending] = useState(false); const [error, setError] = useState<string>();
  async function act() { if (!archived && !window.confirm("Archive this game? It will be removed from current metrics.")) return; setPending(true); try { await apiRequest(`/api/v1/pods/${podId}/games/${gameId}`, { method: "DELETE", body: JSON.stringify({ version, archived: !archived }) }); router.push(`/pods/${podId}/games`); router.refresh(); } catch (cause) { setError(cause instanceof ApiClientError ? cause.message : "Update failed."); setPending(false); } }
  return <div><Button variant={archived ? "secondary" : "danger"} disabled={pending} onClick={act}>{pending ? "Updating…" : archived ? "Restore game" : "Archive game"}</Button>{error && <p className="mt-2 text-xs text-red-300">{error}</p>}</div>;
}
