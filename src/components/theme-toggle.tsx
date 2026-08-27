"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import { ApiClientError, apiRequest } from "@/lib/client-api";
import { applyThemePreference } from "@/lib/theme-client";
import { useThemePreferenceEvents } from "@/components/theme-runtime";
import { useLoadingRouter } from "@/lib/loading-router";
import type { ThemePreference } from "@/lib/theme-types";

const options = [
  { value: "SYSTEM" as const, label: "System", icon: Laptop },
  { value: "LIGHT" as const, label: "Light", icon: Sun },
  { value: "DARK" as const, label: "Dark", icon: Moon },
];

export function ThemeToggle({
  initialPreference,
  initialVersion,
  variant = "full",
}: {
  initialPreference: ThemePreference;
  initialVersion: number;
  variant?: "full" | "icon";
}) {
  const router = useLoadingRouter();
  const [preference, setPreference] = useState(initialPreference);
  const versionRef = useRef(initialVersion);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const syncPreference = useCallback((next: ThemePreference) => setPreference(next), []);
  useThemePreferenceEvents(syncPreference);

  useEffect(() => {
    versionRef.current = initialVersion;
    applyThemePreference(initialPreference);
  }, [initialPreference, initialVersion]);

  async function choose(next: ThemePreference) {
    if (pending || next === preference) return;
    const previous = preference;
    setPending(true);
    setError(undefined);
    applyThemePreference(next);
    try {
      const updated = await apiRequest<{ themePreference: ThemePreference; version: number }>("/api/v1/profile/theme", {
        method: "PATCH",
        body: JSON.stringify({ themePreference: next, version: versionRef.current }),
      });
      versionRef.current = updated.version;
      router.refresh();
    } catch (cause) {
      applyThemePreference(previous);
      setError(cause instanceof ApiClientError ? cause.message : "Could not save the theme preference.");
    } finally {
      setPending(false);
    }
  }

  if (variant === "icon") {
    const index = options.findIndex((option) => option.value === preference);
    const current = options[index] ?? options[0];
    const next = options[(index + 1) % options.length];
    const Icon = current.icon;
    return <div className="relative"><button
      type="button"
      disabled={pending}
      onClick={() => void choose(next.value)}
      aria-label={`Theme: ${current.label}. Switch to ${next.label}`}
      title={`Theme: ${current.label}`}
      className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/5 text-stone-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
    ><Icon className="size-4" /></button>{error && <span role="alert" className="sr-only">{error}</span>}</div>;
  }

  return <div>
    <div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-bold tracking-[.14em] text-stone-500 uppercase">Appearance</p><span className="text-[10px] text-stone-600">Saved to account</span></div>
    <div role="group" aria-label="Theme preference" className="grid grid-cols-3 gap-1 rounded-xl border border-white/8 bg-black/10 p-1">
      {options.map(({ value, label, icon: Icon }) => <button
        key={value}
        type="button"
        disabled={pending}
        aria-pressed={preference === value}
        onClick={() => void choose(value)}
        className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold transition ${preference === value ? "bg-amber-300/15 text-amber-200" : "text-stone-500 hover:bg-white/6 hover:text-white"}`}
      ><Icon className="size-3.5" />{label}</button>)}
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
  </div>;
}
