import { NextResponse } from "next/server";

/** Uniform JSON error responses for route handlers. */
export function jsonError(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Wrap a handler so thrown errors become JSON (with a DB-not-configured special case). */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      const err = e as Error & { status?: number; code?: string };
      if (err?.code === "DB_NOT_CONFIGURED") {
        return jsonError(err.message, 503, { code: "DB_NOT_CONFIGURED" });
      }
      console.error(err);
      return jsonError(err?.message || "Server error", err?.status && err.status >= 400 ? err.status : 500);
    }
  };
}
