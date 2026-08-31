"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useRef, useState } from "react";
import { Archive, FileUp, GripVertical, Pencil, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { AchievementRuleBuilder } from "@/components/achievement-rule-builder";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";
import type { AchievementGameFactRule } from "@/lib/achievement-rules";
import { ApiClientError, apiRequest } from "@/lib/client-api";
import { requiredAchievementRoles, type GameModeCatalogItem, type GameParticipantRole } from "@/lib/game-modes";
import { withGlobalLoading } from "@/lib/loading";
import { useLoadingRouter } from "@/lib/loading-router";

const NEW_CATEGORY = "__new_category__";

export type CatalogAchievement = {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  displayOrder: number;
  archivedAt: Date | string | null;
  version: number;
  gameFactRules?: AchievementGameFactRule[];
};

export type AchievementCategory = {
  id: string;
  name: string;
  displayOrder: number;
  version: number;
};

export function AchievementCatalogManager({ achievements, categories, gameModes = [] }: {
  achievements: CatalogAchievement[];
  categories: AchievementCategory[];
  gameModes?: GameModeCatalogItem[];
}) {
  const router = useLoadingRouter();
  const categorySensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const editorRef = useRef<HTMLDivElement>(null);
  const [catalog, setCatalog] = useState(achievements);
  const [categoryList, setCategoryList] = useState(categories);
  const [modeCatalog, setModeCatalog] = useState(gameModes);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<unknown[]>([]);
  const [csv, setCsv] = useState("");
  const [editing, setEditing] = useState<CatalogAchievement>();
  const [deleting, setDeleting] = useState<CatalogAchievement>();
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [formRevision, setFormRevision] = useState(0);

  const groupedCatalog = useMemo(() => categoryList.map((category) => ({
    category,
    achievements: catalog
      .filter((achievement) => achievement.category === category.name)
      .sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name)),
  })), [catalog, categoryList]);

  function beginEditing(achievement: CatalogAchievement) {
    setEditing(achievement);
    setError(undefined);
    window.requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (!editor) return;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      editor.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      editor.querySelector<HTMLInputElement>('input[name="name"]')?.focus({ preventScroll: true });
    });
  }

  async function resolveCategory(formData: FormData) {
    const selected = String(formData.get("category") ?? "");
    if (selected === NEW_CATEGORY) {
      const created = await apiRequest<AchievementCategory>("/api/v1/admin/achievement-categories", {
        method: "POST",
        body: JSON.stringify({ name: formData.get("newCategoryName") }),
      });
      setCategoryList((current) => current.some((category) => category.id === created.id) ? current : [...current, created]);
      return created.name;
    }
    const category = categoryList.find((item) => item.id === selected);
    if (!category) throw new Error("The selected achievement category is unavailable.");
    return category.name;
  }

  async function create(formData: FormData) {
    setPending(true); setError(undefined);
    try {
      const fields = await readFields(formData, resolveCategory);
      const lastOrder = catalog.filter((achievement) => achievement.category === fields.category)
        .reduce((maximum, achievement) => Math.max(maximum, achievement.displayOrder), 0);
      await apiRequest("/api/v1/admin/achievements", {
        method: "POST",
        body: JSON.stringify({ ...fields, displayOrder: lastOrder + 10 }),
      });
      setFormRevision((current) => current + 1);
      router.refresh();
    } catch (cause) { setError(message(cause, "Could not create the achievement.")); }
    finally { setPending(false); }
  }

  async function save(formData: FormData) {
    if (!editing) return;
    setPending(true); setError(undefined);
    try {
      const fields = await readFields(formData, resolveCategory);
      const categoryChanged = fields.category !== editing.category;
      const targetLastOrder = catalog.filter((achievement) => achievement.category === fields.category)
        .reduce((maximum, achievement) => Math.max(maximum, achievement.displayOrder), 0);
      await apiRequest(`/api/v1/admin/achievements/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...fields, ...(categoryChanged && { displayOrder: targetLastOrder + 10 }), version: editing.version }),
      });
      setEditing(undefined); router.refresh();
    } catch (cause) { setError(message(cause, "Could not save the achievement.")); }
    finally { setPending(false); }
  }

  async function reorderCategories(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const previous = categoryList;
    const oldIndex = previous.findIndex((category) => category.id === event.active.id);
    const newIndex = previous.findIndex((category) => category.id === event.over?.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(previous, oldIndex, newIndex);
    setCategoryList(reordered);
    setPending(true); setError(undefined);
    try {
      const updated = await apiRequest<AchievementCategory[]>("/api/v1/admin/achievement-categories/reorder", {
        method: "PATCH",
        body: JSON.stringify({ items: reordered.map(({ id, version }) => ({ id, version })) }),
      });
      setCategoryList(updated);
    } catch (cause) {
      setCategoryList(previous);
      setError(message(cause, "Could not reorder the categories."));
    } finally { setPending(false); }
  }

  async function reorderCategoryAchievements(category: AchievementCategory, reordered: CatalogAchievement[]) {
    const previous = catalog;
    const otherAchievements = catalog.filter((achievement) => achievement.category !== category.name);
    setCatalog([...otherAchievements, ...reordered]);
    setPending(true); setError(undefined);
    try {
      const updated = await apiRequest<CatalogAchievement[]>("/api/v1/admin/achievements/reorder", {
        method: "PATCH",
        body: JSON.stringify({
          categoryId: category.id,
          items: reordered.map(({ id, version }) => ({ id, version })),
        }),
      });
      setCatalog([...otherAchievements, ...updated]);
    } catch (cause) {
      setCatalog(previous);
      setError(message(cause, `Could not reorder ${category.name}.`));
    } finally { setPending(false); }
  }

  async function setArchived(item: CatalogAchievement, archived: boolean) {
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
      const data = await apiRequest<{ records: unknown[] }>("/api/v1/admin/achievements/import", { method: "POST", body: JSON.stringify({ csv, preview: true }) });
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

  return <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
    <section aria-labelledby="achievement-catalog-heading" className="grid min-w-0 content-start gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div><p className="text-xs font-bold tracking-[.16em] text-amber-300 uppercase">Global catalog</p><h2 id="achievement-catalog-heading" className="font-display mt-1 text-2xl">{catalog.length} achievements in {categoryList.length} categories</h2></div>
        <p className="max-w-sm text-xs leading-5 text-stone-500">Drag the dotted handles to reorder categories or the achievements inside them. Focus a handle and use Space plus the arrow keys for keyboard sorting.</p>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/8 p-3 text-sm text-red-300">{error}</p>}

      <DndContext sensors={categorySensors} collisionDetection={closestCenter} onDragEnd={(event) => void reorderCategories(event)}>
        <SortableContext items={categoryList.map((category) => category.id)} strategy={verticalListSortingStrategy}>
          <div className="grid min-w-0 gap-4">
            {groupedCatalog.map(({ category, achievements: categoryAchievements }) => <SortableCategoryGroup
              key={category.id}
              category={category}
              achievements={categoryAchievements}
              pending={pending}
              onReorder={(reordered) => void reorderCategoryAchievements(category, reordered)}
              onEdit={beginEditing}
              onArchive={(achievement) => void setArchived(achievement, !achievement.archivedAt)}
              onDelete={(achievement) => { setDeleting(achievement); setDeleteConfirmation(""); setError(undefined); }}
            />)}
          </div>
        </SortableContext>
      </DndContext>
    </section>

    <div className="grid h-fit min-w-0 gap-5">
      <div id="achievement-editor" ref={editorRef} className="scroll-mt-24"><Card className="p-5"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2">{editing ? <Pencil className="size-4 text-violet-200" /> : <Plus className="size-4 text-amber-200" />}<h2 className="font-display text-xl">{editing ? "Edit achievement" : "Add achievement"}</h2></div>{editing && <button type="button" onClick={() => setEditing(undefined)} aria-label="Cancel editing" className="text-stone-500 hover:text-white"><X className="size-4" /></button>}</div><AchievementForm key={`${editing?.id ?? "new"}:${formRevision}`} item={editing} categories={categoryList} gameModes={modeCatalog} pending={pending} action={editing ? save : create} /></Card></div>
      <AchievementModeMappings achievements={catalog} gameModes={modeCatalog} pending={pending} setPending={setPending} setError={setError} onSaved={(mode) => setModeCatalog((current) => current.map((candidate) => candidate.code === mode.code ? mode : candidate))} />
      <Card className="p-5"><div className="mb-4 flex items-center gap-2"><FileUp className="size-4 text-violet-200" /><h2 className="font-display text-xl">CSV import</h2></div><input type="file" accept=".csv,text/csv" onChange={(event) => void readCsv(event.target.files?.[0])} className="mb-3 block w-full text-xs text-stone-500 file:mr-3 file:rounded-lg file:border-0 file:bg-white/8 file:px-3 file:py-2 file:text-stone-300" /><textarea value={csv} onChange={(event) => setCsv(event.target.value)} rows={5} className={`${inputClass} h-auto py-3 font-mono text-xs`} placeholder="code,name,description,category,display_order" /><div className="mt-3 flex gap-2"><Button type="button" variant="secondary" disabled={!csv || pending} onClick={previewCsv}>Preview</Button>{preview.length > 0 && <Button type="button" disabled={pending} onClick={commitCsv}>Import {preview.length}</Button>}</div>{preview.length > 0 && <p className="mt-3 text-xs text-emerald-300">Validated {preview.length} rows. Commit will be transactional.</p>}</Card>
      {deleting && <Card className="border-red-400/20 p-5"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-2 text-red-200"><Trash2 className="size-5" /><h2 className="font-display text-xl">Permanent deletion</h2></div><button type="button" onClick={() => setDeleting(undefined)} aria-label="Cancel deletion" className="text-stone-500 hover:text-white"><X className="size-4" /></button></div><p className="mt-3 text-sm leading-6 text-stone-400">This removes <strong className="text-white">{deleting.name}</strong> and every POD/player grant of it. Audit events remain.</p><Field label={<>Type <code className="text-red-200">DELETE {deleting.code}</code> to confirm</>}><input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className={`${inputClass} mt-3 border-red-400/20 focus:border-red-300/60 focus:ring-red-300/10`} autoComplete="off" /></Field><Button type="button" variant="danger" className="mt-4 w-full" disabled={pending || deleteConfirmation !== `DELETE ${deleting.code}`} onClick={hardDelete}>{pending ? "Deleting..." : "Permanently delete achievement"}</Button></Card>}
    </div>
  </div>;
}

function SortableCategoryGroup({ category, achievements, pending, onReorder, onEdit, onArchive, onDelete }: {
  category: AchievementCategory;
  achievements: CatalogAchievement[];
  pending: boolean;
  onReorder: (achievements: CatalogAchievement[]) => void;
  onEdit: (achievement: CatalogAchievement) => void;
  onArchive: (achievement: CatalogAchievement) => void;
  onDelete: (achievement: CatalogAchievement) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category.id, disabled: pending });
  const achievementSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleAchievementDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = achievements.findIndex((achievement) => achievement.id === event.active.id);
    const newIndex = achievements.findIndex((achievement) => achievement.id === event.over?.id);
    if (oldIndex >= 0 && newIndex >= 0) onReorder(arrayMove(achievements, oldIndex, newIndex));
  }

  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? "relative z-20 opacity-70" : undefined}><Card className={`min-w-0 overflow-hidden ${isDragging ? "shadow-2xl" : ""}`}>
    <header className="flex min-w-0 items-center gap-3 border-b border-white/8 bg-white/3 p-4 sm:p-5">
      <DragHandle label={`Move ${category.name} category`} disabled={pending} attributes={attributes} listeners={listeners} />
      <div className="min-w-0 flex-1"><h3 className="font-display truncate text-xl text-stone-100">{category.name}</h3><p className="mt-0.5 text-xs text-stone-500">Drag this header to reorder the category.</p></div>
      <Badge>{achievements.length} {achievements.length === 1 ? "achievement" : "achievements"}</Badge>
    </header>
    <DndContext sensors={achievementSensors} collisionDetection={closestCenter} onDragEnd={handleAchievementDragEnd}>
      <SortableContext items={achievements.map((achievement) => achievement.id)} strategy={verticalListSortingStrategy}>
        {achievements.length ? <div className="divide-y divide-white/7">{achievements.map((achievement) => <SortableAchievementRow key={achievement.id} achievement={achievement} pending={pending} onEdit={onEdit} onArchive={onArchive} onDelete={onDelete} />)}</div> : <p className="p-5 text-sm text-stone-500">No achievements in this category yet.</p>}
      </SortableContext>
    </DndContext>
  </Card></div>;
}

function SortableAchievementRow({ achievement, pending, onEdit, onArchive, onDelete }: {
  achievement: CatalogAchievement;
  pending: boolean;
  onEdit: (achievement: CatalogAchievement) => void;
  onArchive: (achievement: CatalogAchievement) => void;
  onDelete: (achievement: CatalogAchievement) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: achievement.id, disabled: pending });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex min-w-0 items-start gap-2 p-4 sm:gap-3 sm:p-5 ${isDragging ? "relative z-10 bg-stone-950 opacity-70 shadow-xl" : ""}`}>
    <DragHandle label={`Move ${achievement.name}`} disabled={pending} attributes={attributes} listeners={listeners} />
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="min-w-0 break-words font-semibold">{achievement.name}</h4>{achievement.archivedAt && <Badge>Archived</Badge>}{(achievement.gameFactRules?.length ?? 0) > 0 && <Badge><Sparkles className="size-3" />Automatic · {achievement.gameFactRules?.length}</Badge>}</div><p className="mt-1 break-words text-sm text-stone-500">{achievement.description || "No description"}</p><code className="mt-2 block break-all text-[11px] text-stone-600">{achievement.code}</code></div>
    <div className="flex shrink-0 flex-col gap-1 sm:flex-row"><button type="button" disabled={pending} onClick={() => onEdit(achievement)} aria-label={`Edit ${achievement.name}`} className="grid size-9 place-items-center rounded-lg text-stone-500 hover:bg-white/7 hover:text-white"><Pencil className="size-4" /></button><button type="button" disabled={pending} onClick={() => onArchive(achievement)} aria-label={`${achievement.archivedAt ? "Restore" : "Archive"} ${achievement.name}`} className="grid size-9 place-items-center rounded-lg text-stone-500 hover:bg-white/7 hover:text-white">{achievement.archivedAt ? <RotateCcw className="size-4" /> : <Archive className="size-4" />}</button><button type="button" disabled={pending} onClick={() => onDelete(achievement)} aria-label={`Permanently delete ${achievement.name}`} className="grid size-9 place-items-center rounded-lg text-stone-500 hover:bg-red-400/10 hover:text-red-300"><Trash2 className="size-4" /></button></div>
  </div>;
}

function DragHandle({ label, disabled, attributes, listeners }: {
  label: string;
  disabled: boolean;
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
}) {
  return <button
    type="button"
    aria-label={label}
    disabled={disabled}
    className="grid size-10 shrink-0 touch-none place-items-center rounded-xl border border-white/8 text-stone-500 transition hover:border-amber-300/25 hover:bg-amber-300/8 hover:text-amber-200 focus-visible:border-amber-300/40 focus-visible:text-amber-200"
    {...attributes}
    {...listeners}
  ><GripVertical aria-hidden="true" className="size-4" /></button>;
}

function AchievementForm({ item, categories, gameModes, pending, action }: {
  item?: CatalogAchievement;
  categories: AchievementCategory[];
  gameModes: GameModeCatalogItem[];
  pending: boolean;
  action: (data: FormData) => void | Promise<void>;
}) {
  const initialCategory = categories.find((category) => category.name === item?.category)?.id ?? categories[0]?.id ?? NEW_CATEGORY;
  const [category, setCategory] = useState(initialCategory);
  const [gameFactRules, setGameFactRules] = useState<AchievementGameFactRule[]>(item?.gameFactRules ?? []);
  return <form action={action} className="grid gap-3">
    <Field label="Name"><input name="name" required defaultValue={item?.name} className={inputClass} /></Field>
    <Field label="Code"><input name="code" required defaultValue={item?.code} pattern="[a-z0-9]+(-[a-z0-9]+)*" className={inputClass} placeholder="table-savior" /></Field>
    <Field label="Category"><select name="category" required value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass}>{categories.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}<option value={NEW_CATEGORY}>＋ New category…</option></select></Field>
    {category === NEW_CATEGORY && <Field label="New category name"><input name="newCategoryName" required maxLength={80} className={inputClass} placeholder="Politics" autoFocus /></Field>}
    <Field label="Description"><textarea name="description" defaultValue={item?.description} rows={3} className={`${inputClass} h-auto py-3`} /></Field>
    <input type="hidden" name="gameFactRules" value={JSON.stringify(gameFactRules)} />
    <AchievementRuleBuilder rules={gameFactRules} gameModes={gameModes} onChange={setGameFactRules} disabled={pending} />
    <Button disabled={pending}>{item ? "Save achievement" : "Add achievement"}</Button>
  </form>;
}

function AchievementModeMappings({ achievements, gameModes, pending, setPending, setError, onSaved }: {
  achievements: CatalogAchievement[];
  gameModes: GameModeCatalogItem[];
  pending: boolean;
  setPending: (pending: boolean) => void;
  setError: (error: string | undefined) => void;
  onSaved: (mode: GameModeCatalogItem) => void;
}) {
  const [selections, setSelections] = useState<Record<string, Record<string, string>>>(() => Object.fromEntries(gameModes.map((mode) => [mode.code, selectionForMode(mode)])));
  const activeAchievements = achievements.filter((achievement) => !achievement.archivedAt);

  async function saveMode(mode: GameModeCatalogItem) {
    const slots = slotsForMode(mode);
    const nextSelection = selections[mode.code] ?? {};
    if (slots.some((slot) => slot.required && !nextSelection[slot.key])) {
      setError(`Choose an achievement for every required ${mode.name} role.`);
      return;
    }
    const replacements = slots.filter((slot) => {
      const current = mode.winAchievementRules.find((rule) => (rule.winnerRole ?? "GENERAL") === slot.key)?.achievementId ?? "";
      return current && nextSelection[slot.key] !== current;
    });
    if (replacements.length && !window.confirm(`${mode.name} already has ${replacements.length === 1 ? "an occupied achievement slot" : `${replacements.length} occupied achievement slots`}. Replace ${replacements.length === 1 ? "it" : "them"}? Existing games keep their saved rules.`)) return;

    setPending(true); setError(undefined);
    try {
      const winAchievementRules = slots.flatMap((slot) => nextSelection[slot.key] ? [{
        winnerRole: slot.role,
        achievementId: nextSelection[slot.key],
      }] : []);
      const updated = await apiRequest<GameModeCatalogItem>(`/api/v1/admin/game-modes/${mode.code}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: mode.name,
          description: mode.description,
          minPlayers: mode.minPlayers,
          maxPlayers: mode.maxPlayers,
          winningCriteria: mode.winningCriteria,
          winAchievementRules,
          version: mode.version,
        }),
      });
      setSelections((current) => ({ ...current, [mode.code]: selectionForMode(updated) }));
      onSaved(updated);
    } catch (cause) { setError(message(cause, `Could not save ${mode.name} achievement mappings.`)); }
    finally { setPending(false); }
  }

  return <Card className="p-5">
    <div className="mb-4 flex items-start gap-2"><Sparkles className="mt-1 size-4 shrink-0 text-violet-200" /><div><h2 className="font-display text-xl">Game-mode win mappings</h2><p className="mt-1 text-xs leading-5 text-stone-500">These are the same mappings shown in Game Mode Admin. Required role slots must be replaced atomically; saved games keep their original snapshots.</p></div></div>
    <div className="grid gap-3">
      {gameModes.map((mode) => {
        const slots = slotsForMode(mode);
        return <details key={mode.code} className="rounded-xl border border-white/8 bg-black/10 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-stone-200">{mode.name}{mode.archivedAt ? " · Archived" : ""}</summary>
          <div className="mt-3 grid gap-3">
            {slots.map((slot) => <Field key={slot.key} label={`${slot.label}${slot.required ? " · required" : " · optional"}`}><select value={selections[mode.code]?.[slot.key] ?? ""} disabled={pending} onChange={(event) => setSelections((current) => ({ ...current, [mode.code]: { ...current[mode.code], [slot.key]: event.target.value } }))} className={inputClass}><option value="">{slot.required ? "Choose achievement" : "No automatic mode achievement"}</option>{activeAchievements.map((achievement) => <option key={achievement.id} value={achievement.id}>{achievement.category} · {achievement.name}</option>)}</select></Field>)}
            <Button type="button" variant="secondary" disabled={pending} onClick={() => void saveMode(mode)}>Save {mode.name} mappings</Button>
          </div>
        </details>;
      })}
    </div>
  </Card>;
}

function slotsForMode(mode: GameModeCatalogItem): { key: string; role: GameParticipantRole | null; label: string; required: boolean }[] {
  const roles = requiredAchievementRoles(mode.systemKey);
  if (!roles.length) return [{ key: "GENERAL", role: null, label: "Win achievement", required: false }];
  return roles.map((role) => ({ key: role, role, label: role.toLowerCase().replace(/^./, (letter) => letter.toUpperCase()), required: true }));
}

function selectionForMode(mode: GameModeCatalogItem) {
  return Object.fromEntries(mode.winAchievementRules.map((rule) => [rule.winnerRole ?? "GENERAL", rule.achievementId]));
}

async function readFields(formData: FormData, resolveCategory: (formData: FormData) => Promise<string>) {
  return {
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description"),
    category: await resolveCategory(formData),
    gameFactRules: JSON.parse(String(formData.get("gameFactRules") ?? "[]")) as AchievementGameFactRule[],
  };
}

function message(cause: unknown, fallback: string) { return cause instanceof ApiClientError ? cause.message : fallback; }
