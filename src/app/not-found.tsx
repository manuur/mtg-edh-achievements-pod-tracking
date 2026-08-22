import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center p-6 text-center"><div><p className="font-display text-7xl text-amber-200">404</p><h1 className="font-display mt-4 text-3xl">That table isn’t here.</h1><p className="mt-3 mb-6 text-sm text-stone-400">It may be archived, outside your POD access, or the link may be wrong.</p><LinkButton href="/dashboard">Back to dashboard</LinkButton></div></main>;
}
