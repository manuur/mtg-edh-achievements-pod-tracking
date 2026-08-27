# EDH Pod Tracker: Vercel-first zero-to-production guide

This guide assumes Windows PowerShell, an existing GitHub repository, and no Vercel, Neon, or Google configuration yet. Replace every `<PLACEHOLDER>` with your own value and never commit a secret.

The setup deliberately starts with GitHub and Vercel. Neon is then provisioned from the Vercel Marketplace, so the Neon organization, billing relationship, deployment variables, preview branches, and Auth URLs remain connected to the Vercel account.

## Final environment map

Create two Neon resources from the same Vercel project. Do not connect the production resource to Preview deployments.

| Git branch | Vercel target | Neon resource | Database behavior |
|---|---|---|---|
| `feature/*` | Preview | Development Neon | Isolated Neon preview branch |
| `develop` | Persistent Preview | Development Neon | Isolated long-lived preview branch |
| `master` | Production | Production Neon | Production database only |
| Local machine | Vercel Development variables | Development Neon | Development resource's base branch |

This gives you development and production separation on Vercel Hobby without paying for Vercel Custom Environments. Preview databases originate from the development resource, never from real production data.

## 1. Install and verify local tools

Install:

- [Git for Windows](https://git-scm.com/download/win)
- [Node.js 22 LTS](https://nodejs.org/en/download)
- An editor such as [Visual Studio Code](https://code.visualstudio.com/)

Open PowerShell:

```powershell
Set-Location 'C:\Users\USUARIO\Documents\Desarrollos\mtg-edh-achievements-pod-tracking'
node --version
git --version
corepack --version
corepack prepare pnpm@10.15.1 --activate
corepack pnpm install --frozen-lockfile
corepack pnpm check
```

Node must be 22 or newer. If `corepack enable` works on your installation you may run it and then use plain `pnpm`; otherwise, keep using `corepack pnpm` as shown.

## 2. Try the public application shell

No service keys are needed for the public pages:

```powershell
corepack pnpm dev
```

Open `http://localhost:3000`. The landing and login pages work, while the private tracker correctly waits for database/Auth configuration. Stop the server with `Ctrl+C`.

## 3. Push the initial code to GitHub

Vercel needs the code in GitHub before it can create the project and connect Neon.

```powershell
git remote -v
git branch --show-current
git status --short
```

If `origin` is missing:

```powershell
git remote add origin https://github.com/<GITHUB_USER>/<REPOSITORY>.git
```

Stage the application and confirm the local environment file is not included:

```powershell
git add .
git diff --cached -- .env.local
```

The second command must print nothing. Then push `master` and `develop`:

```powershell
git commit -m "Build initial EDH Pod Tracker"
git branch -M master
git push -u origin master
git switch -c develop
git push -u origin develop
```

If GitHub created its own README/license and rejects the first push, do not force-push. Run `git pull --rebase origin master`, resolve any real overlap, rerun `corepack pnpm check`, and push normally.

## 4. Create the Vercel project before Neon

1. Sign in at [vercel.com](https://vercel.com/) with GitHub.
2. Select **Add New > Project**.
3. Import the GitHub repository.
4. Framework preset: **Next.js**.
5. Root directory: `.`.
6. Keep the detected pnpm install and build settings.
7. Do not enter fake database or Auth variables.
8. Select **Deploy**.

The first build succeeds without infrastructure. It is only a bootstrap deployment for creating the Vercel project and obtaining its URL.

In **Project Settings > Environments > Production > Branch Tracking**, confirm `master` is Production. If `develop` was not deployed automatically, go to **Deployments > Create Deployment** and select it.

Record the Production URL and the stable `develop` branch URL shown by Vercel.

## 5. Link the local repository to Vercel

```powershell
corepack pnpm dlx vercel@latest login
corepack pnpm dlx vercel@latest link
```

Choose the Vercel account/team and imported project. Vercel creates an ignored local `.vercel` directory.

Audit the targets with:

```powershell
corepack pnpm dlx vercel@latest env ls production
corepack pnpm dlx vercel@latest env ls preview
corepack pnpm dlx vercel@latest env ls development
```

## 6. Install Neon from the Vercel Marketplace

Open the Vercel project, go to **Storage**, choose **Create Database** or **Browse Storage**, select **Neon Postgres**, and install the integration on the same Vercel team.

The CLI can also start this flow with `vercel integration add neon`, but the dashboard is recommended because environment scoping and preview branching are visible.

### Production Neon resource

1. Create `edh-pod-tracker-production`.
2. Choose the Free plan.
3. Choose Sao Paulo when available, or the closest region to Buenos Aires and the Vercel functions.
4. Enable Neon Auth during creation if offered.
5. Connect it to this Vercel project.
6. Select **Production only**.
7. Leave **Preview** and **Development** unchecked.
8. Do not enable preview branches for this resource.

The integration should add `DATABASE_URL` as a pooled runtime URL and can add `DATABASE_URL_UNPOOLED` as the direct operator URL. If the unpooled variable is missing, enable it in the resource's integration/environment-variable settings. Auth also injects `DATABASE_NEON_AUTH_BASE_URL`.

### Development and Preview Neon resource

Create a second Neon resource:

1. Name it `edh-pod-tracker-development`.
2. Use the same plan and region.
3. Enable Neon Auth.
4. Connect it to **Development** and **Preview** only.
5. Leave **Production** unchecked.
6. In **Advanced Options / Deployment Configuration**, mark the integration required when shown.
7. Enable **Create a database branch for deployment: Preview**.

The identical variable names do not conflict because their environment scopes do not overlap. Production receives the production resource; Preview and local Development receive the development resource. Each Preview deployment receives an isolated branch of the development database.

Manage both resources from Vercel **Storage**. Each resource provides **Open in Neon** / **Manage in Neon** for advanced settings.

## 7. Enable Auth and Data API before migrations

Repeat for development and production:

1. Open Vercel **Storage** and select the Neon resource.
2. Enable Neon Auth if it is not already enabled.
3. Open the linked Neon dashboard.
4. Enable the **Data API** for the default branch/database.
5. Select Neon Auth as the JWT provider.
6. Do not enable blanket `public` schema grants.

The order matters: Data API creates the `authenticated` and `anonymous` roles used by the migration grants.

Before migration, `api` does not exist. Leave the default exposed schema temporarily. After migration, expose only `api`; never expose `app`, `private`, or `neon_auth`.

Inspect Vercel **Settings > Environment Variables**. Confirm the integration has scoped values for:

- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- `DATABASE_NEON_AUTH_BASE_URL`
- `NEON_DATA_API_URL` when the service supplies it

The Data API value ends in `/rest/v1`. If it is not injected, copy it from the linked Neon dashboard and add it to the correct scope. Never replace a deployment-specific Preview value with a fixed Production value.

## 8. Add application-owned Vercel variables

Generate two cookie secrets: one for Preview/Development and one for Production:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Save them in a password manager. Add these under Vercel **Settings > Environment Variables**:

| Name | Production | Preview | Development |
|---|---|---|---|
| `NEON_AUTH_COOKIE_SECRET` | Production secret | Development secret | Development secret |
| `NEXT_PUBLIC_APP_URL` | Production URL | Stable `develop` URL | `http://localhost:3000` |
| `DEV_AUTH_BYPASS` | `false` | `false` | `true` initially |
| `DEV_USER_ID` | Do not add | Do not add | `00000000-0000-4000-8000-000000000001` |
| `DEV_USER_EMAIL` | Do not add | Do not add | `local-owner@example.com` |
| `DEV_USER_NAME` | Do not add | Do not add | `Local Owner` |

Mark cookie secrets sensitive. Keep each stable within its environment. Do not overwrite integration-managed Preview variables such as `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, or `DATABASE_NEON_AUTH_BASE_URL` because they change for isolated branches.

## 9. Pull the Development environment locally

```powershell
corepack pnpm dlx vercel@latest env pull .env.local --environment=development --yes
notepad .env.local
```

Confirm it contains these values, adding application-owned lines if Vercel did not pull them:

```dotenv
DATABASE_URL=<DEVELOPMENT_POOLED_URL_FROM_VERCEL>
DATABASE_URL_UNPOOLED=<DEVELOPMENT_DIRECT_URL_FROM_VERCEL>
DATABASE_NEON_AUTH_BASE_URL=<DEVELOPMENT_AUTH_URL_FROM_VERCEL>
NEON_DATA_API_URL=<DEVELOPMENT_DATA_API_URL_ENDING_/rest/v1>
NEON_AUTH_COOKIE_SECRET=<DEVELOPMENT_COOKIE_SECRET>
DEV_AUTH_BYPASS=true
DEV_USER_ID=00000000-0000-4000-8000-000000000001
DEV_USER_EMAIL=local-owner@example.com
DEV_USER_NAME=Local Owner
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Migration tooling recognizes Vercel's `DATABASE_URL_UNPOOLED` directly. Confirm the file is ignored:

```powershell
git check-ignore .env.local
```

## 10. Apply the development schema and try the full app

```powershell
corepack pnpm db:migrate
corepack pnpm db:verify
corepack pnpm db:seed
corepack pnpm dev
```

Open `http://localhost:3000/login`, select **Enter local workspace**, and exercise the application. Return to development Data API settings and expose only `api`.

### Preview migrations

The repository contains a `vercel-build` script. On Vercel Preview only, it applies checked-in migrations to the automatically created Neon preview branch before building Next.js. Production migrations remain an explicit protected GitHub workflow.

Redeploy `develop` after connecting the development resource. Its build should report `Database migrations applied successfully` before the Next.js build.

## 11. Configure GitHub Actions and branch protection

In GitHub **Settings > Environments**, create:

- `development`
- `production`
- `restore-drill`

Copy the development resource's Development-scoped `DATABASE_URL_UNPOOLED` into the `development` Environment secret `DATABASE_MIGRATION_URL`. Copy the production resource's Production-scoped value into the same secret name in the `production` Environment. Add required-reviewer protection to Production if available.

Wait for **CI / verify** to pass. Then create GitHub Rulesets for `master` and `develop`:

1. Require pull requests.
2. Require status check `verify`.
3. Block force pushes and deletion.
4. Do not require another reviewer while you are the only developer.

## 12. Configure Google OAuth

Use separate Google Cloud projects for Development and Production.

### Development

1. Create `EDH Pod Tracker Development` in [Google Cloud Console](https://console.cloud.google.com/).
2. Open **Google Auth Platform > Get started**.
3. Configure app name, support email, and developer contact.
4. Choose **External** unless all players belong to one Workspace organization.
5. Keep Testing status and add your Google email as a test user.
6. Request only `openid`, `email`, and `profile`.
7. Create a **Web application** OAuth client.
8. Open the development Neon resource through Vercel, then **Auth > OAuth providers > Google**.
9. Copy Neon's exact callback into Google's **Authorized redirect URIs**. Copy any displayed JavaScript origin exactly.
10. Paste Google's Client ID and secret into development Neon Auth and enable it.
11. Add `http://localhost:3000` as a trusted origin. The Vercel integration manages deployment origins.

The Google secret belongs only in Neon Auth, not `.env.local`, Vercel, GitHub, or source code.

Change `DEV_AUTH_BYPASS=false` in `.env.local`, restart, and sign in. Bootstrap the Development Superadmin:

```powershell
corepack pnpm db:bootstrap-superuser -- your-google-email@example.com
```

Custom Google credentials may require registering the exact callback for a new Preview branch. Register the long-lived `develop` callback once; add feature-preview callbacks only when you need authenticated testing there.

### Production

Repeat with `EDH Pod Tracker Production` and the production Neon callback. Add the Vercel Production URL as a trusted origin if the integration has not done so automatically.

For an initial private beta, Testing mode works with listed test users, but authorizations can expire after seven days. Before a stable beta, publish the OAuth app and meet Google's current homepage, branding, and privacy requirements. Do not add Drive, Sheets, Gmail, or other scopes.

## 13. Migrate and release Production

Run GitHub **Actions > Apply database migrations > Run workflow**:

1. Workflow branch: `master` for the first release.
2. Target: `production`.
3. Wait for migration and verification.

Set the Production Data API to expose only `api`, then redeploy `master` in Vercel.

Smoke test:

1. Sign in through Production Google OAuth.
2. Confirm `/dashboard` loads.
3. Run **Bootstrap application Superadmin**, target `production`, with the exact signed-in email.
4. Verify `/admin/achievements`.
5. Create a POD, members, decks, and a game.
6. Confirm Editor/Guest restrictions and metrics.

Never run `db:seed` against Production.

## 14. Normal feature and release workflow

```powershell
git switch develop
git pull --ff-only origin develop
git switch -c feature/<SHORT_FEATURE_NAME>
corepack pnpm dev
corepack pnpm check
git add .
git commit -m "Describe the feature"
git push -u origin feature/<SHORT_FEATURE_NAME>
```

Then:

1. PR `feature/...` -> `develop`.
2. Vercel creates a Preview and an isolated development Neon branch.
3. Preview build automatically migrates that branch.
4. Merge and test stable `develop`.
5. PR `develop` -> `master`.
6. Code-only changes can merge after CI/testing.
7. Schema changes use the following order.

### Production schema-change order

Never use `drizzle-kit push` on shared or Production databases.

1. Change Drizzle schema and SQL policies/functions.
2. Run `corepack pnpm db:generate` when appropriate.
3. Review the SQL and test locally/through Preview.
4. Merge it to `develop` and test.
5. Before merging to `master`, run **Apply database migrations** from the `develop` workflow branch with target `production`.
6. Only backward-compatible expand migrations may run before code deployment.
7. After verification, merge `develop` to `master`.
8. Destructive contract migrations belong in a later release.

## 15. Configure encrypted R2 backups

After the first release, create a private Cloudflare R2 bucket named `edh-pod-tracker-backups` and a bucket-scoped Object Read & Write token.

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Add GitHub repository secrets:

| Secret | Value |
|---|---|
| `PRODUCTION_DATABASE_URL` | Production `DATABASE_URL_UNPOOLED` |
| `R2_ACCOUNT_ID` | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | R2 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 Secret Access Key |
| `BACKUP_ENCRYPTION_PASSPHRASE` | Generated passphrase |

Add repository variable `R2_BUCKET=edh-pod-tracker-backups`. Run **Encrypted database backup** and confirm `daily/YYYY-MM-DD.dump.enc` exists. The schedule is 04:17 UTC (01:17 Buenos Aires), retaining seven daily, four weekly, and six monthly backups.

For a restore drill, create a disposable branch in the production Neon resource, create an empty `restore_drill` database, store its direct URL as `RESTORE_DATABASE_URL` in GitHub's `restore-drill` Environment, run the drill, and delete the branch. Never restore into Development or Production.

## 16. Secret placement reference

| Value | Vercel | Local | GitHub | Neon | Google |
|---|---:|---:|---:|---:|---:|
| `DATABASE_URL` pooled | Integration-managed/scoped | Pulled from Development | No | Source | No |
| `DATABASE_URL_UNPOOLED` | Integration-managed/scoped | Pulled from Development | Protected migration/backup secret | Source | No |
| `DATABASE_NEON_AUTH_BASE_URL` | Integration-managed/scoped | Pulled from Development | No | Source | No |
| `NEON_DATA_API_URL` | Integration-managed when available | Pulled from Development | No | Source | No |
| Cookie secret | Manually scoped | Development value | No | No | No |
| Google client ID/secret | No | No | No | OAuth provider config | Source |
| R2 credentials/passphrase | No | No | Repository secrets | No | No |
| Superadmin assignment | No | No | Operator workflow | App database | No |

If any secret is exposed, rotate it at the provider; removing it from a file is not enough.

## 17. Troubleshooting

```powershell
corepack pnpm db:check
corepack pnpm db:verify
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm dlx vercel@latest env ls production
corepack pnpm dlx vercel@latest env ls preview
git status --short
```

- Preview sees Production data: disconnect Production Neon from Preview immediately; only Development Neon should have Preview scope.
- Preview migration uses a pooler: enable `DATABASE_URL_UNPOOLED` in integration variables.
- `permission denied for schema api`: Data API roles were created after migrations; correct and retest grants in a disposable branch first.
- Auth works locally but not in Preview: inspect Preview-specific Auth URL, trusted origin, and Google callback.
- `jwk not found` from a direct SQL query: do not pass the Neon Auth JWT to `neon(DATABASE_URL, { authToken })` in this Data API architecture. Use `NEON_DATA_API_URL` plus `fetchWithToken` for user-authorized operations, and keep the separate Neon RLS/JWKS integration disabled.
- New Vercel variables are ignored: redeploy; variables affect new deployments only.
- `redirect_uri_mismatch`: Google's value is not byte-for-byte identical to Neon's callback.
- Production missing tables/functions: run the protected Production migration workflow for the deployed commit.
- Backup URL contains `-pooler`: use Production `DATABASE_URL_UNPOOLED`.

## Official references

- [Vercel Marketplace storage](https://vercel.com/docs/marketplace-storage)
- [Vercel Git deployments](https://vercel.com/docs/git)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Neon Auth in Vercel previews](https://neon.com/blog/auth-that-just-works-in-vercel-previews)
- [Neon branch per Vercel Preview](https://neon.com/blog/neon-vercel-native-integration)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Neon Data API setup](https://neon.com/docs/data-api/get-started)
- [Google Auth Platform](https://support.google.com/cloud/answer/15544987)
- [Google OAuth clients](https://support.google.com/cloud/answer/15549257)
- [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [Cloudflare R2 S3 credentials](https://developers.cloudflare.com/r2/get-started/s3/)
