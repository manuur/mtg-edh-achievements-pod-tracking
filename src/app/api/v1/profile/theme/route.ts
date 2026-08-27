import type { NextRequest } from "next/server";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { updateThemePreferenceSchema } from "@/lib/validation";
import { updateThemePreference } from "@/server/profile";

export const PATCH = withApi(async (request: NextRequest) => {
  const context = await requireUserContext();
  const input = updateThemePreferenceSchema.parse(await parseJson(request));
  return success(await updateThemePreference(context, input));
});
