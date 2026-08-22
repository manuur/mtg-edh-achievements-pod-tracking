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

The browser talks only to same-origin `/api/v1` handlers. Route handlers validate the Neon Auth session, resolve the linked player, and forward its JWT through Neon's authenticated SQL/Data API endpoints, so ordinary reads and writes execute as the `authenticated` role under RLS. Transactional game and private claim-email changes use actor-bound `api` functions. The elevated connection is confined to the trusted claim-or-create callback and operator workflows such as migrations, backups, and Superuser bootstrap.

## Environments

- Local: local Next.js plus a disposable Postgres/Neon branch and optional non-production auth bypass.
- Preview/staging: Vercel previews connected to a non-production Neon project or expiring branch.
- Production: independent Neon project and Vercel production environment.

Preview environments must never branch directly from production data.

## Scalability

Use cursor pagination, narrow projections, composite indexes, and immediate SQL aggregates first. Add materialized summaries only after measured query latency justifies them. The modular service boundaries allow metrics or background jobs to move independently later without changing the public API.
