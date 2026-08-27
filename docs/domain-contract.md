# Domain contract

## Roles

Roles apply per POD. Guests read shared data and manage their own decks. Editors additionally manage games, other POD members' decks, and achievement grants. Administrators additionally manage the POD, memberships, roles, and game archival. The last Administrator cannot leave or be demoted.

Superadmin is an independent singleton application privilege assigned only through the operator bootstrap script. It can manage the global achievement catalog and permanently purge non-Superadmin player identities. A purge does not provide blanket POD visibility, but the Superadmin explicitly takes over a POD when the deleted player was its final Administrator.

## Identity

An auth account links to one global player. Administrators may create unclaimed players and attach a private normalized email. A trusted Google callback claims that player on exact verified-email match. Unclaimed players cannot be Editors or Administrators.

Each claimed player has a persisted appearance preference: System, Light, or Dark. New profiles default to System, which follows the operating-system color-scheme preference.

## Records

- Decks are global to their owner and reusable across PODs. Commander bracket is required; EDHPowerLevel is optional.
- Games contain 2–8 unique active POD players, one owned deck each, and either one winner or a draw.
- Games snapshot deck name, bracket, and the power level when one is set.
- Achievements are global catalog entries, but grants are unique per POD, player, and achievement. Every grant references an active game in the same POD in which that player participated; the achievement's earned date is the game's `played_at` value, while `granted_at` is only the staff audit timestamp. Grants tied to archived games do not count until the game is restored.
- Normal user-visible deletion archives data. The Superadmin screens additionally expose guarded permanent deletion: deleting an achievement removes its grants, while deleting a player removes their authentication identity, sessions, memberships, decks, grants, and games they participated in. Both require exact typed confirmation and retain a non-identifying audit event.

## Metrics

Win rate is wins divided by total games, including draws. Rankings require three appearances. Power distributions exclude games whose deck had no power level. Filters support all-time, 30-day, 90-day, and custom ranges. Users see aggregate data only in shared PODs, except for their own cross-POD totals.
