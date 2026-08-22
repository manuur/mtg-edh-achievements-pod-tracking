import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { importAchievements, parseAchievementCsv } from "@/server/achievements";

export const POST = withApi(async (request: NextRequest) => {
  const body = z.object({ csv: z.string().min(1).max(1_000_000), preview: z.boolean().default(false) }).parse(await parseJson(request));
  if (body.preview) return success({ records: parseAchievementCsv(body.csv) });
  return success(await importAchievements(await requireUserContext(), body.csv), 201);
});
