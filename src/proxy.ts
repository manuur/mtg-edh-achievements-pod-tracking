import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getNeonAuth } from "@/lib/auth/server";
import { isDevAuthEnabled } from "@/lib/env";

export default function proxy(request: NextRequest) {
  if (isDevAuthEnabled()) return NextResponse.next();

  const auth = getNeonAuth();
  if (!auth) return NextResponse.next();

  // Besides protecting these pages, Neon Auth uses its middleware to exchange
  // the one-time OAuth verifier on the callback for the application's session
  // cookies before the requested Server Components render.
  return auth.middleware({ loginUrl: "/login" })(request);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/pods/:path*",
    "/decks/:path*",
    "/players/:path*",
    "/admin/:path*",
    "/settings/:path*",
  ],
};
