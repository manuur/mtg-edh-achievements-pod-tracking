import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getNeonAuth } from "@/lib/auth/server";

async function unavailable() {
  return NextResponse.json({ error: { code: "AUTH_UNAVAILABLE", message: "Neon Auth is not configured." } }, { status: 503 });
}

type AuthRouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: AuthRouteContext) {
  const auth = getNeonAuth();
  return auth ? auth.handler().GET(request, context) : unavailable();
}

export async function POST(request: NextRequest, context: AuthRouteContext) {
  const auth = getNeonAuth();
  return auth ? auth.handler().POST(request, context) : unavailable();
}
