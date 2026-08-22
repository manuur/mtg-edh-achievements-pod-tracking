# Domain contract

## Roles

Roles apply per POD. Guests read shared data and manage their own decks. Editors additionally manage games, other POD members' decks, and achievement grants. Administrators additionally manage the POD, memberships, roles, and game archival. The last Administrator cannot leave or be demoted.

Superuser is an independent singleton privilege for the global achievement catalog only. It grants no POD visibility.

## Identity

An auth account links to one global player. Administrators may create unclaimed players and attach a private normalized email. A trusted Google callback claims that player on exact verified-email match. Unclaimed players cannot be Editors or Administrators.

## Records

- Decks are global to their owner and reusable across PODs.
- Games contain 2–8 unique active POD players, one owned deck each, and either one winner or a draw.
- Games snapshot deck name, bracket, and power level.
- Achievements are global catalog entries but grants are unique per POD, player, and achievement.
- User-visible deletion archives data. Archived games and revoked achievements do not contribute to current metrics.

## Metrics

Win rate is wins divided by total games, including draws. Rankings require three appearances. Filters support all-time, 30-day, 90-day, and custom ranges. Users see aggregate data only in shared PODs, except for their own cross-POD totals.
