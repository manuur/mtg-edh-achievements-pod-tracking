import type { NextRequest } from "next/server";
import { parseJson, success, withApi } from "@/lib/api";
import { requireUserContext } from "@/lib/auth/server";
import { updateProfileSchema } from "@/lib/validation";
import { getProfile, updateProfile } from "@/server/profile";

export const GET = withApi(async () => success(await getProfile(await requireUserContext())));
export const PATCH = withApi(async (request: NextRequest) => {
  const context = await requireUserContext();
  return success(await updateProfile(context, updateProfileSchema.parse(await parseJson(request))));
});
