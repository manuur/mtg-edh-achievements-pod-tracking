# EDH Pod Tracker

A private, role-aware Commander/EDH playgroup tracker for POD memberships, decks, games, achievements, and analytics.

## Stack

- Next.js App Router and TypeScript
- Neon Postgres, Neon Auth, and Google OAuth
- Drizzle schema/migrations
- Tailwind CSS
- Vitest and Testing Library
- Vercel Hobby deployment

## Local setup

1. Install Node.js 22+ and enable Corepack: `corepack enable`.
2. Install dependencies: `pnpm install`.
3. Copy `.env.example` to `.env.local` and provide a pooled Neon `DATABASE_URL` plus a direct `DATABASE_MIGRATION_URL`.
4. Enable Neon Auth, Google OAuth, and the authenticated Data API in the Neon Console. Set `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, and `NEON_DATA_API_URL`.
5. Apply the schema with `pnpm db:migrate`.
6. Start the application with `pnpm dev`.

Use `pnpm db:seed` for a small local fixture or `pnpm db:seed:synthetic` for the 500-game metrics/query-plan fixture. `pnpm db:verify` confirms that the schema, RLS, and transactional game API are installed.

For UI development without OAuth, set `DEV_AUTH_BYPASS=true`. This bypass is hard-disabled in production.

## Quality gates

Run `pnpm check` before merging. The current suite covers request validation, achievement CSV parsing, date ranges, and migration/RLS contracts. Schema changes must be added as versioned migrations and verified in a disposable Neon branch before production.

Start with the complete [`docs/setup-guide.md`](docs/setup-guide.md). See [`docs/architecture.md`](docs/architecture.md), [`docs/domain-contract.md`](docs/domain-contract.md), and [`docs/runbook.md`](docs/runbook.md) for the operational contract.
