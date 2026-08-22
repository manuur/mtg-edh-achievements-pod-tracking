# Operations runbook

## Provisioning

1. Import the GitHub repository into Vercel, then provision separate development/preview and production Neon resources through the Vercel Marketplace integration in regions close to the Vercel function region.
2. Enable Neon Auth and Google OAuth in each project.
3. Enable the Data API and authenticated SQL endpoint with Neon Auth as the JWT provider. Expose only the `api` schema through PostgREST; never expose `app` or `private` as Data API schemas.
4. Set the pooled `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `NEON_DATA_API_URL`, and `NEXT_PUBLIC_APP_URL` in Vercel. Keep the direct `DATABASE_MIGRATION_URL` only in protected GitHub Environments for migration/operator workflows.
5. Apply migrations to staging, run `pnpm db:verify`, then apply the same migration set to production.
6. Register the Vercel preview and production callback URLs in Google OAuth and Neon Auth.
7. Sign in once with the owner account and run `pnpm db:bootstrap-superuser -- owner@example.com` using operator credentials.

## Release

Every change must pass `pnpm check`. Database migrations use expand/contract changes and must remain compatible with the currently deployed application during rollout.

## Backups

The scheduled workflow creates an AES-256 encrypted logical dump and uploads it to private R2. Configure `PRODUCTION_DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BACKUP_ENCRYPTION_PASSPHRASE`, and the `R2_BUCKET` repository variable. The job retains seven daily, four weekly, and six monthly restore points.

Run the manual restore-drill workflow against an empty disposable Neon branch every quarter. Its protected `restore-drill` GitHub environment requires `RESTORE_DATABASE_URL`; never point that secret at staging or production.

## Production smoke test

1. Complete Google sign-in and profile claiming.
2. Create a POD, add a Guest placeholder with an exact claim email, and claim it from the second account.
3. Record, edit, archive, and restore one game; confirm metrics change exactly once.
4. Grant and revoke one achievement as an Editor.
5. Confirm a non-member receives 403/404 for the POD API and cannot access `private` through the Data API.
6. Trigger one encrypted backup and restore it into a disposable branch.

## Incidents

- Auth failures: verify OAuth callback URLs, Neon Auth endpoint, and cookie-secret consistency.
- Database cold start: retry once with jitter; do not rely on session-local state.
- Quota pressure: investigate audit growth and query volume at 70% utilization; upgrade before 80% sustained use.
- Bad release: roll back the Vercel deployment. Use forward-compatible database fixes; do not manually edit production tables.
