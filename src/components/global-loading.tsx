"use client";

import { useEffect, useRef, useSyncExternalStore, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import {
  beginNavigationLoading,
  getGlobalLoadingServerSnapshot,
  getGlobalLoadingSnapshot,
  subscribeGlobalLoading,
} from "@/lib/loading";

function LoadingOverlay({ message }: { message: string }) {
  return <div
    role="status"
    aria-live="assertive"
    aria-busy="true"
    aria-label={message}
    className="fixed inset-0 z-[100] grid cursor-wait place-items-center bg-stone-950/82 px-6 backdrop-blur-md"
  >
    <div className="grid min-w-56 place-items-center rounded-2xl border border-amber-300/20 bg-stone-950/95 px-8 py-7 text-center shadow-[0_24px_100px_rgba(0,0,0,.65)]">
      <LoaderCircle aria-hidden="true" className="size-10 animate-spin text-amber-300" strokeWidth={2} />
      <p className="mt-4 text-sm font-semibold text-stone-100">{message}</p>
      <p className="mt-1 text-xs text-stone-500">Please wait</p>
    </div>
  </div>;
}

export function GlobalLoadingProvider({ children }: { children: ReactNode }) {
  const loading = useSyncExternalStore(
    subscribeGlobalLoading,
    getGlobalLoadingSnapshot,
    getGlobalLoadingServerSnapshot,
  );
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading.active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    overlayRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [loading.active]);

  function trackLink(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    const destination = new URL(anchor.href, window.location.href);
    if (destination.origin !== window.location.origin) return;
    const currentRoute = `${window.location.pathname}${window.location.search}`;
    const nextRoute = `${destination.pathname}${destination.search}`;
    if (currentRoute === nextRoute) return;
    beginNavigationLoading();
  }

  function trackNativeForm(event: FormEvent<HTMLDivElement>) {
    const form = event.target as HTMLFormElement;
    const action = form.getAttribute("action");
    if (!action || form.target === "_blank") return;
    const destination = new URL(action, window.location.href);
    if (destination.origin !== window.location.origin) return;
    beginNavigationLoading(destination.pathname.includes("sign-out") ? "Signing out…" : "Submitting…");
  }

  return <>
    <div onClickCapture={trackLink} onSubmitCapture={trackNativeForm} inert={loading.active ? true : undefined} aria-hidden={loading.active || undefined}>{children}</div>
    {loading.active && <div ref={overlayRef} tabIndex={-1}><LoadingOverlay message={loading.message} /></div>}
  </>;
}

export function RouteLoadingOverlay() {
  return <LoadingOverlay message="Loading page…" />;
}
