import { GameForm } from "@/components/forms/game-form";
import { PageHeader } from "@/components/ui";
import { AppError } from "@/lib/errors";
import { requireUserContext } from "@/lib/auth/server";
import { listDecks } from "@/server/decks";
import { getGame } from "@/server/games";
import { getPod, listMembers } from "@/server/pods";

export default async function EditGamePage({ params }: { params: Promise<{ podId: string; gameId: string }> }) {
  const { podId, gameId } = await params;
  const context = await requireUserContext();
  const [pod, game, members, deckRows] = await Promise.all([
    getPod(context, podId), getGame(context, podId, gameId), listMembers(context, podId), listDecks(context, undefined, podId),
  ]);
  if (pod.role === "GUEST") throw new AppError(403, "FORBIDDEN", "Editors or Administrators edit games.");
  if (game.archivedAt) throw new AppError(422, "VALIDATION_ERROR", "Restore this game before editing it.");
  const initialPlayedAt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: pod.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(game.playedAt).replace(" ", "T");
  return <div className="grid gap-6"><PageHeader eyebrow="Correct a result" title="Edit game" description={`Saving is atomic. Times use ${pod.timezone}.`} /><GameForm podId={podId} podTimezone={pod.timezone} members={members} initialDecks={deckRows} initialPlayedAt={initialPlayedAt} initialGame={{ id: game.id, version: game.version, resultKind: game.resultKind, winnerPlayerId: game.winnerPlayerId, notes: game.notes, participants: game.participants.map((participant) => ({ playerId: participant.playerId, deckId: participant.deckId })) }} /></div>;
}
