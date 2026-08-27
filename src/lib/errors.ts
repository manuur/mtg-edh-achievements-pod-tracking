import { ZodError } from "zod";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "DATABASE_UNAVAILABLE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return new AppError(422, "VALIDATION_ERROR", "The request could not be validated.", error.flatten().fieldErrors);
  }
  if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
    return new AppError(409, "CONFLICT", "A record with those values already exists.");
  }
  let databaseCandidate: unknown = error;
  for (let depth = 0; depth < 3; depth++) {
    if (!databaseCandidate || typeof databaseCandidate !== "object") break;
    if ("code" in databaseCandidate && typeof (databaseCandidate as { code?: unknown }).code === "string") break;
    databaseCandidate = "cause" in databaseCandidate ? (databaseCandidate as { cause?: unknown }).cause : undefined;
  }
  if (databaseCandidate && typeof databaseCandidate === "object" && "code" in databaseCandidate) {
    const databaseError = databaseCandidate as { code?: string; message?: string };
    if (databaseError.code === "42501") return new AppError(403, "FORBIDDEN", "The database denied this action.");
    if (["23514", "22P02", "22023"].includes(databaseError.code ?? "")) {
      return new AppError(422, "VALIDATION_ERROR", databaseError.message ?? "The data is invalid.");
    }
    if (["23505", "40001"].includes(databaseError.code ?? "")) {
      return new AppError(409, "CONFLICT", databaseError.message ?? "The change conflicts with current data.");
    }
  }
  return new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
}
