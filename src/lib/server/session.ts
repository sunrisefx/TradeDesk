// Session helpers shared by proxy.ts and the auth route. Web Crypto only (runs on any runtime).

export const SESSION_COOKIE = "td_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 60; // 60 days — log in once per convention season

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Deterministic token derived from the passcode; rotating either env var logs every device out. */
export async function expectedSessionToken(passcode: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret || "tradedesk-dev-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`tradedesk:v1:${passcode}`));
  return toHex(sig);
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
