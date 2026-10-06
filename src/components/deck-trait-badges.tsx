import { Badge } from "@/components/ui";

export function DeckTraitBadges({ hasPartnerCommanders, hasCompanion, hasBackground }: {
  hasPartnerCommanders: boolean;
  hasCompanion: boolean;
  hasBackground: boolean;
}) {
  const traits = [
    ...(hasPartnerCommanders ? ["Partner commanders"] : []),
    ...(hasCompanion ? ["Companion"] : []),
    ...(hasBackground ? ["Background"] : []),
  ];
  if (!traits.length) return null;
  return <div className="mt-2 flex flex-wrap gap-1.5">{traits.map((trait) => <Badge key={trait} tone="violet">{trait}</Badge>)}</div>;
}
