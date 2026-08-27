export const THEME_PREFERENCES = ["SYSTEM", "LIGHT", "DARK"] as const;
export const THEME_STORAGE_KEY = "edh-theme-preference";
export const THEME_CHANGE_EVENT = "edh-theme-preference-change";

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = "light" | "dark";
