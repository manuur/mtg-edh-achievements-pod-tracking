"use client";

import { useEffect } from "react";
import { Button, Card, LinkButton } from "@/components/ui";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error("App route failed", { digest: error.digest }); }, [error]);
  return <Card className="mx-auto grid min-h-80 max-w-2xl place-items-center p-8 text-center"><div><p className="text-xs font-bold tracking-[.18em] text-red-300 uppercase">Something went wrong</p><h1 className="font-display mt-2 text-3xl">The table hit a rules snag.</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-400">Retry the request. If it keeps happening, keep the request ID from the API response or this error digest for troubleshooting.</p>{error.digest && <code className="mt-3 block text-xs text-stone-600">{error.digest}</code>}<div className="mt-6 flex justify-center gap-2"><Button onClick={retry}>Try again</Button><LinkButton href="/dashboard" variant="secondary">Dashboard</LinkButton></div></div></Card>;
}
