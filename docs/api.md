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

## Routes

- `GET|POST /pods`; `GET|PATCH|DELETE /pods/{podId}`
- `GET|POST /pods/{podId}/members`; `PATCH|DELETE /pods/{podId}/members/{playerId}`
- `GET|POST /decks`; `GET|PATCH|DELETE /decks/{deckId}`
- `GET|POST /pods/{podId}/games`; `GET|PATCH|DELETE /pods/{podId}/games/{gameId}`
- `GET|POST /admin/achievements`; `PATCH|DELETE /admin/achievements/{achievementId}`; `POST /admin/achievements/import`
- `GET|POST|DELETE /pods/{podId}/achievement-grants`
- `GET /metrics/me`; `GET /metrics/pods/{podId}`; `GET /metrics/players/{playerId}`; `GET /metrics/decks/{deckId}`
- `GET|PATCH /profile`; `GET /pods/{podId}/audit`

`DELETE` means archive for PODs, memberships, decks, games, and achievements. Restore uses the documented `archived: false` update path. No v1 handler physically deletes domain history.
