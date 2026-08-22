import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

// Vercel's Neon integration creates an isolated database branch before a
// Preview build and injects that branch's URLs. Apply the checked-in migrations
// to that disposable branch. Production migrations remain an explicit,
// protected GitHub Environment workflow.
if (process.env.VERCEL_ENV === "preview" && process.env.DATABASE_URL) {
  await import("./migrate");
} else if (process.env.VERCEL_ENV === "preview") {
  console.log("Preview database is not connected yet; skipping migrations for this bootstrap build.");
}

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const build = spawnSync(process.execPath, [nextCli, "build"], {
  env: process.env,
  stdio: "inherit",
});

if (build.error) throw build.error;
process.exit(build.status ?? 1);
