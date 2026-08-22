import { NextRequest, NextResponse } from "next/server";
import { AppError, toAppError } from "@/lib/errors";

export interface RouteContext<T extends Record<string, string> = Record<string, string>> {
  params: Promise<T>;
}

export function success<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export async function parseJson(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new AppError(422, "VALIDATION_ERROR", "Expected an application/json request body.");
  }
  return request.json() as Promise<unknown>;
}

function verifyOrigin(request: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.nextUrl.host) {
    throw new AppError(403, "FORBIDDEN", "Cross-origin mutations are not allowed.");
  }
}

const mutationWindows = new Map<string, { count: number; resetsAt: number }>();

function enforceMutationLimit(request: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const now = Date.now();
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${address}:${request.nextUrl.pathname}`;
  const current = mutationWindows.get(key);
  if (!current || current.resetsAt <= now) {
    mutationWindows.set(key, { count: 1, resetsAt: now + 60_000 });
    return;
  }
  current.count += 1;
  if (current.count > 60) throw new AppError(429, "RATE_LIMITED", "Too many changes. Wait a minute and try again.");
  if (mutationWindows.size > 5_000) {
    for (const [storedKey, value] of mutationWindows) if (value.resetsAt <= now) mutationWindows.delete(storedKey);
  }
}

export function withApi<T extends Record<string, string> = Record<string, string>>(
  handler: (request: NextRequest, context: RouteContext<T>, requestId: string) => Promise<NextResponse>,
) {
  return async (request: NextRequest, context: RouteContext<T>) => {
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    try {
      verifyOrigin(request);
      enforceMutationLimit(request);
      const response = await handler(request, context, requestId);
      response.headers.set("x-request-id", requestId);
      response.headers.set("server-timing", `app;dur=${(performance.now() - startedAt).toFixed(1)}`);
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) console.info(JSON.stringify({ requestId, method: request.method, path: request.nextUrl.pathname, status: response.status, durationMs: Math.round(performance.now() - startedAt) }));
      return response;
    } catch (error) {
      const appError = toAppError(error);
      if (appError.status >= 500) console.error(JSON.stringify({ requestId, code: appError.code, path: request.nextUrl.pathname, durationMs: Math.round(performance.now() - startedAt), error: error instanceof Error ? error.name : "UnknownError" }));
      return NextResponse.json({
        error: {
          code: appError.code,
          message: appError.message,
          fieldErrors: appError.fieldErrors,
          requestId,
        },
      }, { status: appError.status, headers: { "x-request-id": requestId } });
    }
  };
}
