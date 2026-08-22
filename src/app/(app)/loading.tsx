import { Card } from "@/components/ui";

export default function AppLoading() {
  return <div aria-label="Loading page" role="status" className="grid animate-pulse gap-6"><div><div className="h-3 w-32 rounded bg-amber-300/15" /><div className="mt-3 h-10 w-72 max-w-full rounded bg-white/8" /><div className="mt-3 h-4 w-[34rem] max-w-full rounded bg-white/5" /></div><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[1,2,3,4].map((item) => <Card key={item} className="h-24 bg-white/3" />)}</section><Card className="h-80 bg-white/3" /><span className="sr-only">Loading…</span></div>;
}
