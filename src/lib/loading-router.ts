"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { beginGlobalLoading, beginNavigationLoading } from "@/lib/loading";

export function useLoadingRouter() {
  const router = useRouter();
  const [refreshPending, startRefresh] = useTransition();
  const refreshPendingRef = useRef(refreshPending);
  const finishRefreshRef = useRef<(() => void) | null>(null);

  const finishRefresh = useCallback(() => {
    finishRefreshRef.current?.();
    finishRefreshRef.current = null;
  }, []);

  useEffect(() => {
    refreshPendingRef.current = refreshPending;
    if (!refreshPending) finishRefresh();
  }, [finishRefresh, refreshPending]);

  useEffect(() => finishRefresh, [finishRefresh]);

  function refresh() {
    finishRefresh();
    finishRefreshRef.current = beginGlobalLoading("Refreshing…", "navigation");
    startRefresh(() => router.refresh());
    window.setTimeout(() => { if (!refreshPendingRef.current) finishRefresh(); }, 50);
  }

  function push(...args: Parameters<typeof router.push>) {
    beginNavigationLoading();
    router.push(...args);
  }

  function replace(...args: Parameters<typeof router.replace>) {
    beginNavigationLoading();
    router.replace(...args);
  }

  function back() {
    beginNavigationLoading();
    router.back();
  }

  function forward() {
    beginNavigationLoading();
    router.forward();
  }

  return { ...router, refresh, push, replace, back, forward };
}
