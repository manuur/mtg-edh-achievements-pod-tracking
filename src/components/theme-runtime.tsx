"use client";

import { useEffect } from "react";
import { applyThemePreference, getStoredThemePreference } from "@/lib/theme-client";
import { THEME_CHANGE_EVENT, THEME_STORAGE_KEY, type ThemePreference } from "@/lib/theme-types";

export function ThemeRuntime() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyStored = (notify = false) => applyThemePreference(getStoredThemePreference(), { persist: false, notify });
    const handleSystemChange = () => {
      if (getStoredThemePreference() === "SYSTEM") applyStored(false);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) applyStored(true);
    };
    media.addEventListener("change", handleSystemChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      media.removeEventListener("change", handleSystemChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return null;
}

export function useThemePreferenceEvents(onChange: (preference: ThemePreference) => void) {
  useEffect(() => {
    const handleChange = (event: Event) => onChange((event as CustomEvent<ThemePreference>).detail);
    window.addEventListener(THEME_CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleChange);
  }, [onChange]);
}
