"use client";

export class ApiClientError extends Error {
  constructor(message: string, public readonly status: number, public readonly fieldErrors?: Record<string, string[]>) {
    super(message);
  }
}

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string; fieldErrors?: Record<string, string[]> } } | null;
    throw new ApiClientError(payload?.error?.message ?? "The request failed.", response.status, payload?.error?.fieldErrors);
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as { data: T };
  return payload.data;
}
