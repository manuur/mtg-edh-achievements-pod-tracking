export type LoadingScope = "request" | "navigation" | "manual";

export interface GlobalLoadingSnapshot {
  active: boolean;
  message: string;
}

type LoadingEntry = { message: string; scope: LoadingScope };

const idleSnapshot: GlobalLoadingSnapshot = { active: false, message: "Loading…" };
const entries = new Map<number, LoadingEntry>();
const listeners = new Set<() => void>();
let nextId = 1;
let snapshot = idleSnapshot;

function publish() {
  const latest = Array.from(entries.values()).at(-1);
  snapshot = latest ? { active: true, message: latest.message } : idleSnapshot;
  for (const listener of listeners) listener();
}

export function beginGlobalLoading(message = "Loading…", scope: LoadingScope = "manual") {
  const id = nextId++;
  entries.set(id, { message, scope });
  publish();
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    entries.delete(id);
    publish();
  };
}

export function clearGlobalLoading(scope?: LoadingScope) {
  if (scope) {
    for (const [id, entry] of entries) if (entry.scope === scope) entries.delete(id);
  } else {
    entries.clear();
  }
  publish();
}

export function subscribeGlobalLoading(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getGlobalLoadingSnapshot() {
  return snapshot;
}

export function getGlobalLoadingServerSnapshot() {
  return idleSnapshot;
}

export function beginNavigationLoading(message = "Loading page…") {
  if (typeof window === "undefined") return () => undefined;
  const initialUrl = window.location.href;
  const end = beginGlobalLoading(message, "navigation");
  const startedAt = performance.now();

  function watchNavigation() {
    if (window.location.href !== initialUrl || performance.now() - startedAt > 12_000) {
      end();
      return;
    }
    window.requestAnimationFrame(watchNavigation);
  }
  window.requestAnimationFrame(watchNavigation);
  return end;
}

export async function withGlobalLoading<T>(operation: () => Promise<T>, message = "Loading…") {
  const end = beginGlobalLoading(message);
  try {
    return await operation();
  } finally {
    end();
  }
}
