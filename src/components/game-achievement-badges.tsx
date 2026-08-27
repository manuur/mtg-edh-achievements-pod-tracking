import { Award } from "lucide-react";
import type { GameAchievementBadge } from "@/server/games";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui";

export function GameAchievementBadges({
  achievements,
  showPlayer = true,
  className,
}: {
  achievements: GameAchievementBadge[];
  showPlayer?: boolean;
  className?: string;
}) {
  if (!achievements.length) return null;

  return <ul aria-label="Achievements earned in this game" className={cn("mt-2 flex flex-wrap gap-1.5", className)}>
    {achievements.map((achievement) => <li
      key={`${achievement.playerId}:${achievement.achievementId}`}
      title={`${achievement.playerName} earned ${achievement.achievementName}${achievement.archivedAt ? " (archived catalog entry)" : ""}`}
      className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-300/8 px-2 py-1 text-[11px] font-semibold text-amber-100"
    >
      <Award aria-hidden="true" className="size-3 shrink-0 text-amber-300" />
      <span className="truncate">{achievement.achievementName}</span>
      {showPlayer && <span className="shrink-0 text-amber-300/65">· {achievement.playerName}</span>}
    </li>)}
  </ul>;
}

export function GameAchievementBreakdown({
  achievements,
  players,
}: {
  achievements: GameAchievementBadge[];
  players: { playerId: string; playerName: string }[];
}) {
  const achievementPlayers = players.map((player) => ({
    ...player,
    achievements: achievements.filter((achievement) => achievement.playerId === player.playerId),
  })).filter((player) => player.achievements.length > 0);

  if (!achievementPlayers.length) return null;

  return <Card className="overflow-hidden">
    <div className="border-b border-white/8 p-5">
      <p className="text-xs font-bold tracking-[.16em] text-amber-300 uppercase">Achievements earned</p>
      <h2 className="font-display mt-1 text-2xl">Badges from this game</h2>
      <p className="mt-1 text-sm text-stone-500">Each badge is grouped under the player who earned it.</p>
    </div>
    <div className="divide-y divide-white/7">{achievementPlayers.map((player) => <section key={player.playerId} aria-labelledby={`game-achievements-${player.playerId}`} className="p-5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-300/10 font-display text-amber-200">{player.playerName.slice(0, 1).toUpperCase()}</span>
        <div><h3 id={`game-achievements-${player.playerId}`} className="font-semibold text-stone-100">{player.playerName}</h3><p className="text-xs text-stone-500">{player.achievements.length} {player.achievements.length === 1 ? "badge" : "badges"}</p></div>
      </div>
      <GameAchievementBadges achievements={player.achievements} showPlayer={false} className="mt-3 pl-12" />
    </section>)}</div>
  </Card>;
}
