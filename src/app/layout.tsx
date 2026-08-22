import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EDH Pod Tracker", template: "%s · EDH Pod Tracker" },
  description: "Private Commander pod, game, deck, achievement, and analytics tracking.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="noise">{children}</body></html>;
}
