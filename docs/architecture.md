# Architecture decision record

## Context

EDH Pod Tracker is a private, multi-tenant application where a POD is the tenant boundary. It must remain inexpensive at hobby scale while preserving a relational model and an upgrade path.

## Decision

- Next.js App Router runs on Vercel Hobby.
- Neon provides serverless Postgres and Neon Auth with Google OAuth.
- Drizzle owns the typed schema and forward-only migrations.
- PostgreSQL constraints and row-level policies are the final data-integrity boundary; route handlers add request validation and friendly errors.
- The application is a modular monolith split into identity, POD, deck, game, achievement, and metrics modules.
- Historical facts are preserved through archival and game-time snapshots.

Neon compute may scale to zero. All database access must tolerate a cold first request and reconnect without session assumptions.

## Runtime boundaries

The browser talks only to same-origin `/api/v1` handlers and never receives database credentials. Route handlers validate the Neon Auth session, resolve the linked player, and enforce the application role checks before using the trusted server-side Drizzle connection. Security-sensitive transactional game and private claim-email changes additionally forward the user's JWT through Neon's Data API to actor-bound `api` functions, where RLS and the function contract enforce the same identity again. Do not pass a Neon Auth JWT to the direct SQL driver or configure Neon's separate direct-SQL JWT/JWKS RLS mode on a Data API branch. Operator-only migrations, backups, and Superadmin bootstrap use the unpooled maintenance connection.

## Environments

- Local: local Next.js plus a disposable Postgres/Neon branch and optional non-production auth bypass.
- Preview/staging: Vercel previews connected to a non-production Neon project or expiring branch.
- Production: independent Neon project and Vercel production environment.

Preview environments must never branch directly from production data.

## Scalability

Use cursor pagination, narrow projections, composite indexes, and immediate SQL aggregates first. Add materialized summaries only after measured query latency justifies them. The modular service boundaries allow metrics or background jobs to move independently later without changing the public API.
