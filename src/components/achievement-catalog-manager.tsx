"use client";

import { useLoadingRouter } from "@/lib/loading-router";
import { useState } from "react";
import { Archive, FileUp, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { ApiClientError, apiRequest } from "@/lib/client-api";
import { withGlobalLoading } from "@/lib/loading";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";

type Achievement = { id: string; code: string; name: string; description: string; category: string; displayOrder: number; archivedAt: Date | string | null; version: number };

export function AchievementCatalogManager({ achievements }: { achievements: Achievement[] }) {
  const router = useLoadingRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<Achievement[]>([]);
  const [csv, setCsv] = useState("");
  const [editing, setEditing] = useState<Achievement>();
  const [deleting, setDeleting] = useState<Achievement>();
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  async function create(formData: FormData) {
    setPending(true); setError(undefined);
    try {
      await apiRequest("/api/v1/admin/achievements", { method: "POST", body: JSON.stringify(readFields(formData)) });
      router.refresh();
    } catch (cause) { setError(message(cause, "Could not create the achievement.")); }
    finally { setPending(false); }
  }
  async function save(formData: FormData) {
    if (!editing) return;
    setPending(true); setError(undefined);
    try {
      await apiRequest(`/api/v1/admin/achievements/${editing.id}`, { method: "PATCH", body: JSON.stringify({ ...readFields(formData), version: editing.version }) });
      setEditing(undefined); router.refresh();
    } catch (cause) { setError(message(cause, "Could not save the achievement.")); }
    finally { setPending(false); }
  }
  async function setArchived(item: Achievement, archived: boolean) {
    setPending(true); setError(undefined);
    try {
      await apiRequest(`/api/v1/admin/achievements/${item.id}`, {
        method: archived ? "DELETE" : "PATCH",
        body: JSON.stringify(archived ? { version: item.version } : { version: item.version, archived: false }),
      });
      router.refresh();
    } catch (cause) { setError(message(cause, "Could not update the achievement.")); }
    finally { setPending(false); }
  }
  async function hardDelete() {
    if (!deleting) return;
    setPending(true); setError(undefined);
    try {
      await apiRequest(`/api/v1/admin/achievements/${deleting.id}/hard-delete`, {
        method: "DELETE",
        body: JSON.stringify({ version: deleting.version, confirmation: deleteConfirmation }),
      });
      setDeleting(undefined); setDeleteConfirmation(""); router.refresh();
    } catch (cause) { setError(message(cause, "Could not permanently delete the achievement.")); }
    finally { setPending(false); }
  }
  async function previewCsv() {
    setPending(true); setError(undefined);
    try {
      const data = await apiRequest<{ records: Achievement[] }>("/api/v1/admin/achievements/import", { method: "POST", body: JSON.stringify({ csv, preview: true }) });
      setPreview(data.records);
    } catch (cause) { setError(message(cause, "Invalid CSV.")); }
    finally { setPending(false); }
  }
  async function commitCsv() {
    setPending(true); setError(undefined);
    try {
      await apiRequest("/api/v1/admin/achievements/import", { method: "POST", body: JSON.stringify({ csv, preview: false }) });
      setCsv(""); setPreview([]); router.refresh();
    } catch (cause) { setError(message(cause, "Import failed.")); }
    finally { setPending(false); }
  }
  async function readCsv(file?: File) {
    if (!file) { setCsv(""); return; }
    setCsv(await withGlobalLoading(() => file.text(), "Reading CSV…"));
  }

  return <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
    <Card className="overflow-hidden"><div className="border-b border-white/8 p-5"><p className="text-xs font-bold tracking-[.16em] text-amber-300 uppercase">Global catalog</p><h2 className="font-display mt-1 text-2xl">{achievements.length} achievements</h2></div><div className="divide-y divide-white/7">{achievements.map((item) => <div key={item.id} className="flex gap-4 p-5"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.name}</h3><Badge tone="violet">{item.category}</Badge>{item.archivedAt && <Badge>Archived</Badge>}</div><p className="mt-1 text-sm text-stone-500">{item.description || "No description"}</p><code className="mt-2 block text-[11px] text-stone-600">{item.code} · order {item.displayOrder}</code></div><div className="flex gap-1"><button disabled={pending} onClick={() => setEditing(item)} aria-label={`Edit ${item.name}`} className="grid size-9 place-items-center rounded-lg text-stone-500 hover:bg-white/7 hover:text-white"><Pencil className="size-4" /></button><button disabled={pending} onClick={() => setArchived(item, !item.archivedAt)} aria-label={`${item.archivedAt ? "Restore" : "Archive"} ${item.name}`} className="grid size-9 place-items-center rounded-lg text-stone-500 hover:bg-white/7 hover:text-white">{item.archivedAt ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}</button><button disabled={pending} onClick={() => { setDeleting(item); setDeleteConfirmation(""); setError(undefined); }} aria-label={`Permanently delete ${item.name}`} className="grid size-9 place-items-center rounded-lg text-stone-500 hover:bg-red-400/10 hover:text-red-300"><Trash2 className="size-4" /></button></div></div>)}</div></Card>
    <div className="grid h-fit gap-5">
      <Card className="p-5"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2">{editing ? <Pencil className="size-4 text-violet-200" /> : <Plus className="size-4 text-amber-200" />}<h2 className="font-display text-xl">{editing ? "Edit achievement" : "Add achievement"}</h2></div>{editing && <button onClick={() => setEditing(undefined)} aria-label="Cancel editing" className="text-stone-500 hover:text-white"><X className="size-4" /></button>}</div><AchievementForm key={editing?.id ?? "new"} item={editing} pending={pending} action={editing ? save : create} defaultOrder={achievements.length * 10} /></Card>
      <Card className="p-5"><div className="mb-4 flex items-center gap-2"><FileUp className="size-4 text-violet-200" /><h2 className="font-display text-xl">CSV import</h2></div><input type="file" accept=".csv,text/csv" onChange={(event) => void readCsv(event.target.files?.[0])} className="mb-3 block w-full text-xs text-stone-500 file:mr-3 file:rounded-lg file:border-0 file:bg-white/8 file:px-3 file:py-2 file:text-stone-300" /><textarea value={csv} onChange={(event) => setCsv(event.target.value)} rows={5} className={`${inputClass} h-auto py-3 font-mono text-xs`} placeholder="code,name,description,category,display_order" /><div className="mt-3 flex gap-2"><Button type="button" variant="secondary" disabled={!csv || pending} onClick={previewCsv}>Preview</Button>{preview.length > 0 && <Button type="button" disabled={pending} onClick={commitCsv}>Import {preview.length}</Button>}</div>{preview.length > 0 && <p className="mt-3 text-xs text-emerald-300">Validated {preview.length} rows. Commit will be transactional.</p>}</Card>
      {deleting && <Card className="border-red-400/20 p-5"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-2 text-red-200"><Trash2 className="size-5" /><h2 className="font-display text-xl">Permanent deletion</h2></div><button type="button" onClick={() => setDeleting(undefined)} aria-label="Cancel deletion" className="text-stone-500 hover:text-white"><X className="size-4" /></button></div><p className="mt-3 text-sm leading-6 text-stone-400">This removes <strong className="text-white">{deleting.name}</strong> and every POD/player grant of it. Audit events remain.</p><Field label={<>Type <code className="text-red-200">DELETE {deleting.code}</code> to confirm</>}><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className={`${inputClass} mt-3 border-red-400/20 focus:border-red-300/60 focus:ring-red-300/10`} autoComplete="off" /></Field><Button type="button" variant="danger" className="mt-4 w-full" disabled={pending || deleteConfirmation !== `DELETE ${deleting.code}`} onClick={hardDelete}>{pending ? "Deleting..." : "Permanently delete achievement"}</Button></Card>}
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    </div>
  </div>;
}

function AchievementForm({ item, pending, action, defaultOrder }: { item?: Achievement; pending: boolean; action: (data: FormData) => void; defaultOrder: number }) {
  return <form action={action} className="grid gap-3"><Field label="Name"><input name="name" required defaultValue={item?.name} className={inputClass} /></Field><Field label="Code"><input name="code" required defaultValue={item?.code} pattern="[a-z0-9]+(-[a-z0-9]+)*" className={inputClass} placeholder="table-savior" /></Field><Field label="Category"><input name="category" required defaultValue={item?.category ?? "General"} className={inputClass} /></Field><Field label="Description"><textarea name="description" defaultValue={item?.description} rows={3} className={`${inputClass} h-auto py-3`} /></Field><Field label="Display order"><input name="displayOrder" type="number" min={0} max={100000} defaultValue={item?.displayOrder ?? defaultOrder} className={inputClass} /></Field><Button disabled={pending}>{item ? "Save achievement" : "Add achievement"}</Button></form>;
}

function readFields(formData: FormData) { return { code: formData.get("code"), name: formData.get("name"), description: formData.get("description"), category: formData.get("category"), displayOrder: Number(formData.get("displayOrder")) }; }
function message(cause: unknown, fallback: string) { return cause instanceof ApiClientError ? cause.message : fallback; }
