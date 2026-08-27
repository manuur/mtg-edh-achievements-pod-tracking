"use client";

import {
  THEME_CHANGE_EVENT,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme-types";

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && THEME_PREFERENCES.includes(value as ThemePreference);
}

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "SYSTEM";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "SYSTEM";
  } catch {
    return "SYSTEM";
  }
}

export function resolveTheme(preference: ThemePreference, systemIsDark?: boolean): ResolvedTheme {
  if (preference === "LIGHT") return "light";
  if (preference === "DARK") return "dark";
  const prefersDark = systemIsDark ?? (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return prefersDark ? "dark" : "light";
}

export function applyThemePreference(
  preference: ThemePreference,
  options: { persist?: boolean; notify?: boolean } = {},
) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference.toLowerCase();
  document.documentElement.style.colorScheme = resolved;
  if (options.persist !== false) {
    try { window.localStorage.setItem(THEME_STORAGE_KEY, preference); } catch { /* Storage may be disabled. */ }
  }
  if (options.notify !== false) {
    window.dispatchEvent(new CustomEvent<ThemePreference>(THEME_CHANGE_EVENT, { detail: preference }));
  }
}
