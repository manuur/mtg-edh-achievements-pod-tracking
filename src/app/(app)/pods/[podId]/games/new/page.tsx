import { PageHeader } from "@/components/ui";
import { GameForm } from "@/components/forms/game-form";
import { requireUserContext } from "@/lib/auth/server";
import { getPod, listMembers } from "@/server/pods";
import { listDecks } from "@/server/decks";
import { AppError } from "@/lib/errors";

export default async function NewGamePage({ params }: { params: Promise<{ podId: string }> }) {
  const { podId } = await params; const context = await requireUserContext(); const pod = await getPod(context, podId);
  if (pod.role === "GUEST") throw new AppError(403, "FORBIDDEN", "Editors or Administrators record games.");
  const [members, deckRows] = await Promise.all([listMembers(context, podId), listDecks(context, undefined, podId)]);
  const initialPlayedAt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: pod.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date()).replace(" ", "T");
  return <div className="grid gap-6"><PageHeader eyebrow="New result" title="Record a game" description={`The essentials only. Times use ${pod.timezone}.`} /><GameForm podId={podId} podTimezone={pod.timezone} members={members} initialDecks={deckRows} initialPlayedAt={initialPlayedAt} /></div>;
}
