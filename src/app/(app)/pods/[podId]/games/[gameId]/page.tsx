import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { ArchiveGameButton } from "@/components/forms/archive-game-button";
import { requireUserContext } from "@/lib/auth/server";
import { getPod } from "@/server/pods";
import { getGame } from "@/server/games";
import { formatDate } from "@/lib/utils";

export default async function GameDetailPage({ params }: { params: Promise<{ podId: string; gameId: string }> }) {
  const { podId, gameId } = await params; const context = await requireUserContext();
  const [pod, game] = await Promise.all([getPod(context, podId), getGame(context, podId, gameId)]);
  const winner = game.participants.find((participant) => participant.playerId === game.winnerPlayerId);
  const action = <div className="flex flex-wrap gap-2">{pod.role !== "GUEST" && !game.archivedAt && <LinkButton href={`/pods/${podId}/games/${gameId}/edit`} variant="secondary">Edit game</LinkButton>}{pod.role === "ADMIN" && <ArchiveGameButton podId={podId} gameId={gameId} version={game.version} archived={Boolean(game.archivedAt)} />}</div>;
  return <div className="grid gap-6"><PageHeader eyebrow={formatDate(game.playedAt, pod.timezone)} title={game.resultKind === "DRAW" ? "The table drew." : `${winner?.playerName ?? "A player"} won.`} description={game.notes || "No notes were added to this game."} action={action} /><Card className="overflow-hidden"><div className="grid gap-3 border-b border-white/8 p-5 sm:grid-cols-3"><div><p className="text-[10px] font-bold tracking-[.16em] text-stone-500 uppercase">Result</p><Badge tone={game.resultKind === "WIN" ? "green" : "neutral"} className="mt-2">{game.resultKind}</Badge></div><div><p className="text-[10px] font-bold tracking-[.16em] text-stone-500 uppercase">Players</p><p className="font-display mt-1 text-2xl">{game.participants.length}</p></div><div><p className="text-[10px] font-bold tracking-[.16em] text-stone-500 uppercase">Record version</p><p className="font-display mt-1 text-2xl">{game.version}</p></div></div><div className="divide-y divide-white/7">{game.participants.map((participant) => <div key={participant.playerId} className="grid gap-2 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-center"><div><p className="font-semibold">{participant.playerName}</p>{participant.playerId === game.winnerPlayerId && <p className="mt-1 text-xs font-semibold text-emerald-300">Winner</p>}</div><div><p className="text-sm text-stone-300">{participant.deckName}</p><p className="text-xs text-stone-500">Power {participant.powerLevel.toFixed(2)}</p></div><Badge tone={participant.bracket >= 4 ? "red" : participant.bracket === 3 ? "violet" : "green"}>Bracket {participant.bracket}</Badge></div>)}</div></Card></div>;
}
