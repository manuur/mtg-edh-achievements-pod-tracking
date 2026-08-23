import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextEnv = require("@next/env") as typeof import("@next/env");

export const loadEnvConfig = nextEnv.loadEnvConfig;
