import "server-only";

/** Centralised, typed access to server env vars. Never import from client components. */
export const env = {
  appPasscode: process.env.APP_PASSCODE?.trim() || "",
  sessionSecret: process.env.SESSION_SECRET?.trim() || "",

  visionProvider: (process.env.VISION_PROVIDER?.trim().toLowerCase() || "anthropic") as "anthropic" | "gemini",
  anthropicKey: process.env.ANTHROPIC_API_KEY?.trim() || "",
  anthropicModel: process.env.ANTHROPIC_VISION_MODEL?.trim() || "claude-sonnet-5-5",
  geminiKey: process.env.GEMINI_API_KEY?.trim() || "",
  geminiModel: process.env.GEMINI_VISION_MODEL?.trim() || "gemini-2.5-flash",

  supabaseUrl: process.env.SUPABASE_URL?.trim() || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "",

  priceChartingToken: process.env.PRICECHARTING_TOKEN?.trim() || "",
  ebayClientId: process.env.EBAY_CLIENT_ID?.trim() || "",
  ebayClientSecret: process.env.EBAY_CLIENT_SECRET?.trim() || "",
  ebayMarketplace: process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_US",
  ebayInsights: process.env.EBAY_USE_MARKETPLACE_INSIGHTS === "1",

  cronSecret: process.env.CRON_SECRET?.trim() || "",
};

export function hasDb(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceKey);
}
