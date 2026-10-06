# HTTP API conventions

All application endpoints live under `/api/v1`, require a Neon Auth session, and return JSON.

Success payloads use `{ "data": ... }`. Errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request could not be validated.",
    "fieldErrors": {},
    "requestId": "uuid"
  }
}
```

Status codes: 401 unauthenticated, 403 forbidden, 404 hidden/missing resource, 409 optimistic/idempotency conflict, and 422 validation failure. Mutations accept JSON only and use version numbers for updates. Game creation accepts an `Idempotency-Key` header or body UUID.

Mutation requests are origin-checked and subject to a per-instance safety limit. A saturated limit returns 429 `RATE_LIMITED`.

History endpoints use `limit` and opaque `cursor` parameters. Default and maximum page sizes are 25 and 100.

Game create/update bodies use `gameMode`, nullable `monarchyBanditRule`, `resultKind`, `winnerPlayerIds`, and participants containing `playerId`, `deckId`, nullable `seatPosition`, and nullable `modeRole`. Responses expose `winners[]`, and participant detail exposes `isWinner`. During the expand/contract release, legacy Free-for-all bodies using a singular `winnerPlayerId` remain accepted.

Game modes are catalog records keyed by an immutable uppercase code. Custom modes use `minPlayers`, `maxPlayers`, and `winningCriteria` (`ONE_WINNER`, `MULTIPLE_WINNERS`, or `ONE_OR_MORE_WINNERS`). Every mode accepts a draw with an empty winner list. Built-in mode limits and winner rules are protected because their seating, team, and role invariants depend on those values.

Game-mode create/update responses and mutations include `winAchievementRules: { winnerRole, achievementId }[]`. Generic modes accept one optional rule with a null role. Archenemy requires `ARCHENEMY` and `HERO`; Monarchy requires `KING`, `KINGSGUARD`, `TRAITOR`, and `BANDIT`. Game writes derive automatic grants from these rules; clients never submit automatic grants.

Deck create/update bodies include nullable integer `commanderCmc` and nullable `colorIdentity`. Color identity is a canonical subset of `W`, `U`, `B`, `R`, and `G`; `null` means unknown while `[]` means explicitly colorless. Game participant responses expose immutable `commanderCmc` and `colorIdentity` snapshots.

Deck requests and participant responses also expose `hasPartnerCommanders`, `hasCompanion`, and `hasBackground`. New decks default each flag to `false`; partial updates preserve omitted values. Game requests cannot supply these snapshots or automatic grants.

Achievement Admin create/update requests and responses include `gameFactRules` (default `[]` on creation; omitted on PATCH means preserve existing rules). Each rule has `recipient: "WINNER"` and 1–10 typed `conditions`. Conditions in a rule are AND; up to ten rules are OR. For example:

```json
{
  "gameFactRules": [
    {
      "recipient": "WINNER",
      "conditions": [
        { "fact": "COMMANDER_CMC", "operator": "EQ", "value": 3 },
        { "fact": "PLAYER_COUNT", "operator": "EQ", "value": 4 }
      ]
    }
  ]
}
```

Supported facts are `GAME_MODE`, `PLAYER_COUNT`, `MONARCHY_BANDIT_RULE`, `WINNER_SEAT`, `WINNER_ROLE`, `DECK_BRACKET`, `DECK_POWER_LEVEL`, `COMMANDER_CMC`, `COLOR_IDENTITY`, `COLOR_COUNT`, `HAS_PARTNER_COMMANDERS`, `HAS_COMPANION`, and `HAS_BACKGROUND`. Numeric operators are `EQ`, `NEQ`, `LT`, `LTE`, `GT`, `GTE`, and inclusive `BETWEEN` with `[minimum, maximum]`. Mode and Bandit-rule facts accept `EQ`/`NEQ`; role facts also accept `IS_KNOWN`/`IS_UNKNOWN`. Nullable numeric facts accept known/unknown operators. Color operators are `EXACTLY`, `CONTAINS_ALL`, `CONTAINS_ANY`, `EXCLUDES_ALL`, `IS_COLORLESS`, `IS_KNOWN`, and `IS_UNKNOWN`. Boolean flags accept `EQ`/`NEQ` with a boolean value. Known/unknown/colorless operators omit `value`. Invalid combinations return 422.

The Achievement Admin mapping panel submits full, versioned mutations to the existing `/admin/game-modes/{code}` endpoint. It shares the same records as Game Mode Admin. Occupied slot replacements require UI confirmation and required role slots are saved together. CSV import remains unchanged and creates no configurable rules. All Achievement Admin endpoints, including catalog reads, require Superadmin access.

## Routes

- `GET|POST /pods`; `GET|PATCH|DELETE /pods/{podId}`
- `GET|POST /pods/{podId}/members`; `PATCH|DELETE /pods/{podId}/members/{playerId}`
- `GET|POST /decks`; `GET|PATCH|DELETE /decks/{deckId}`
- `GET|POST /pods/{podId}/games`; `GET|PATCH|DELETE /pods/{podId}/games/{gameId}`
- `GET|POST /admin/game-modes`; `PATCH|DELETE /admin/game-modes/{code}` (Superadmin; `DELETE` archives)
- `GET|POST /admin/achievements`; `PATCH|DELETE /admin/achievements/{achievementId}`; `POST /admin/achievements/import`
- `PATCH /admin/achievements/reorder`; `GET|POST /admin/achievement-categories`; `PATCH /admin/achievement-categories/reorder`
- `DELETE /admin/achievements/{achievementId}/hard-delete` (Superadmin, exact typed confirmation)
- `GET /admin/users`; `DELETE /admin/users/{playerId}` (Superadmin, exact typed confirmation)
- `GET|POST|DELETE /pods/{podId}/achievement-grants`
- `GET /pods/{podId}/achievement-games?playerId={playerId}` (cursor-paginated eligible games for granting)
- `GET /metrics/me`; `GET /metrics/pods/{podId}`; `GET /metrics/players/{playerId}`; `GET /metrics/decks/{deckId}`
- `GET|PATCH /profile`; `PATCH /profile/theme`; `GET /pods/{podId}/audit`

Ordinary `DELETE` means archive for PODs, memberships, decks, games, and achievements. Restore uses the documented `archived: false` update path. Archiving or permanently deleting an achievement currently assigned to an active game mode returns `409 ACHIEVEMENT_IN_USE`. The explicitly named Superadmin hard-delete endpoint physically removes an achievement and its grants; the Superadmin user endpoint physically removes a non-Superadmin identity and the dependent records described in the domain contract.
