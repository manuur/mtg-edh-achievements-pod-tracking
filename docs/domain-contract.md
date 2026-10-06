# Domain contract

## Roles

Roles apply per POD. Guests read shared data and manage their own decks. Editors additionally manage games, other POD members' decks, and achievement grants. Administrators additionally manage the POD, memberships, roles, and game archival. The last Administrator cannot leave or be demoted.

Superadmin is an independent singleton application privilege assigned only through the operator bootstrap script. It can manage the global achievement and game-mode catalogs and permanently purge non-Superadmin player identities. A purge does not provide blanket POD visibility, but the Superadmin explicitly takes over a POD when the deleted player was its final Administrator.

## Identity

An auth account links to one global player. Administrators may create unclaimed players and attach a private normalized email. A trusted Google callback claims that player on exact verified-email match. Unclaimed players cannot be Editors or Administrators.

Each claimed player has a persisted appearance preference: System, Light, or Dark. New profiles default to System, which follows the operating-system color-scheme preference.

## Records

- Game modes are global catalog records administered only by the Superadmin. Generic modes configure a name, description, two-to-eight-player range, whether a win has exactly one, at least two, or at least one winner, and one optional general win achievement. Archenemy and Monarchy instead require a distinct achievement for every winning role before new games can use the mode. Every mode permits a draw. Archiving removes a mode from new-game selection without changing historical games. Built-in structural rules remain protected.

- Decks are global to their owner and reusable across PODs. Commander bracket is required; EDHPowerLevel, Commander CMC, and color identity are optional. CMC is a non-negative integer representing printed mana value. A null color identity is unknown, while an empty identity is explicitly colorless.
- Games contain 2–8 unique active POD players and one owned deck each. Free-for-all has one winner; Pentagon has five clockwise seats and one winner; Asterisk has six seats and one winning opposite-seat pair; Archenemy has one Archenemy against the Heroes team; and Monarchy has six recorded roles with faction-specific winners. Every mode may end in a draw.
- Monarchy stores one King, one Kingsguard, one Traitor, three Bandits, and the Bandit victory rule used for that game. The last saved rule becomes that POD's next default. Recorded roles are visible to POD members after the game.
- Games snapshot deck name, bracket, power level, Commander CMC, and color identity. Later deck edits never rewrite those values.
- Decks also declare Partner commanders, Companion, and Background with booleans defaulting to false. Games snapshot all three flags. Editing a game with the same deck preserves its snapshots; selecting a replacement deck captures that deck's current metadata.
- Achievements are global catalog entries, but grants are unique per POD, player, and achievement. Every grant references an active game in the same POD in which that player participated; the achievement's earned date is the game's `played_at` value, while `granted_at` is only the audit timestamp. New games snapshot their selected mode code and that mode's active automation rules. Winning participants receive any missing general or role-specific achievement automatically, with no player grantor. Draws award nothing. Automatic grants reconcile to the earliest qualifying active game when results change; changing a game's mode invalidates snapshots from its original mode instead of reinterpreting them. Manual grants and explicit staff revocations remain untouched. Games predating the automation migration remain ineligible.
- Achievement categories are normalized global catalog records with their own display order. Achievements are ordered within a category; both orders are maintained by the Superadmin catalog UI and protected by optimistic concurrency.
- Achievements may optionally configure winner-only game-fact rules. Conditions inside a group are AND; groups are OR. Every co-winner is evaluated independently. New games snapshot all active configurable rules, even unmatched ones, and corrections evaluate those definitions against the corrected game and saved participant metadata. Configurable rules can evaluate a corrected mode; specialized mode mappings remain tied to the original mode. Existing games receive no configurable snapshots. Overlap with another rule or a specialized mode mapping still produces one grant per POD/player/achievement. Manual grants and explicit staff revocations remain protected.
- Normal user-visible deletion archives data. The Superadmin screens additionally expose guarded permanent deletion: deleting an achievement removes its grants, while deleting a player removes their authentication identity, sessions, memberships, decks, grants, and games they participated in. Both require exact typed confirmation and retain a non-identifying audit event.

## Metrics

Win rate is wins divided by total games, including draws. Each co-winner receives one player and deck win while the match still counts as one game. Opponent metrics exclude Pentagon neighbors, Asterisk teammates, fellow Archenemy Heroes, and members of the same Monarchy faction. Rankings require three appearances. Power distributions exclude games whose deck had no power level. Filters support all-time, 30-day, 90-day, and custom ranges. Users see aggregate data only in shared PODs, except for their own cross-POD totals.
