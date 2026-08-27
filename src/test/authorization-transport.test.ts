import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const databaseClient = readFileSync(resolve(process.cwd(), "src/db/client.ts"), "utf8");
const dataApiClient = readFileSync(resolve(process.cwd(), "src/db/data-api.ts"), "utf8");
const authServer = readFileSync(resolve(process.cwd(), "src/lib/auth/server.ts"), "utf8");

describe("authenticated database transport", () => {
  it("uses the Data API rather than direct-SQL JWT authentication", () => {
    expect(databaseClient).not.toContain("authToken");
    expect(authServer).not.toContain("getDb({ accessToken })");
    expect(dataApiClient).toContain("fetchWithToken");
    expect(dataApiClient).toContain('db: { schema: "api" }');
  });
});
