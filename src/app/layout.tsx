import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { GlobalLoadingProvider } from "@/components/global-loading";
import { ThemeRuntime } from "@/components/theme-runtime";
import { THEME_STORAGE_KEY } from "@/lib/theme-types";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EDH Pod Tracker", template: "%s · EDH Pod Tracker" },
  description: "Private Commander pod, game, deck, achievement, and analytics tracking.",
};

const themeBootScript = `(() => {
  try {
    const stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    const preference = stored === "LIGHT" || stored === "DARK" || stored === "SYSTEM" ? stored : "SYSTEM";
    const theme = preference === "LIGHT" ? "light" : preference === "DARK" ? "dark" : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.themePreference = preference.toLowerCase();
    root.style.colorScheme = theme;
  } catch {
    document.documentElement.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body className="noise"><script dangerouslySetInnerHTML={{ __html: themeBootScript }} /><ThemeRuntime /><GlobalLoadingProvider>{children}</GlobalLoadingProvider><Analytics /><SpeedInsights /></body></html>;
}
