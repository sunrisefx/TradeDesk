# TradeDesk — Pokémon card trade evaluator (iPhone PWA)

Mobile-first Next.js PWA for collectors trading live at card shops, conventions and card shows.
Scan cards through sleeves and top-loaders in five languages, price them from several markets,
and run a side-by-side trade with a live equity gauge.

| | |
|---|---|
| **Stack** | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Zustand |
| **Data** | Supabase Postgres (binder, wishlist, trades, price history) |
| **Vision** | Claude (default) or Gemini Flash via `/api/scan` |
| **Catalog** | TCGdex (free, multilingual, no key) |
| **Prices** | TCGplayer + Cardmarket (via TCGdex) · PriceCharting · eBay |
| **Hosting** | Vercel, zero-config, with a daily Cron |

---

## 1. Architecture

```
 iPhone (Safari / Home-Screen PWA)
 ┌───────────────────────────────────────────────────────────────────────────┐
 │  Trade Desk  ·  Scanner  ·  Binder (4/9-pocket)  ·  Wishlist  ·  History  │
 │  Zustand stores ── localStorage (live trade + settings survive refresh)   │
 │  Camera pipeline: burst 4 frames → sharpest (Laplacian) → crop to guide   │
 │                   → 1400px JPEG (~300 KB)                                  │
 │  Service worker: cached app shell + card art, live /api                   │
 └──────────────────────────────┬────────────────────────────────────────────┘
                                │ HTTPS (session cookie, APP_PASSCODE gate in proxy.ts)
 ┌──────────────────────────────▼────────────────────────────────────────────┐
 │ Vercel — Next.js route handlers (Node runtime)                            │
 │                                                                           │
 │  POST /api/scan ─► vision.ts ──► Claude Messages API (forced tool call)   │
 │        │                    └──► Gemini (fallback / alternative)          │
 │        ├──► catalog/resolve.ts ─► TCGdex  (native language → EN fallback, │
 │        │                                   scored on number/set/name)     │
 │        └──► pricing/aggregate.ts                                          │
 │                 ├─ tcgdex-prices.ts  TCGplayer USD + Cardmarket EUR (EN)  │
 │                 ├─ pricecharting.ts  sold data, JP/KO/CN + graded         │
 │                 ├─ ebay.ts           Browse (asking) / Insights (sold)    │
 │                 ├─ fx.ts             ECB rates (Frankfurter) + fallback   │
 │                 └─ consensus by language priority + outlier guard         │
 │                                                                           │
 │  /api/search  /api/prices  /api/fx  /api/binder  /api/wishlist            │
 │  /api/trades (atomic complete_trade() RPC)  /api/cron/snapshot (daily)    │
 └──────────────────────────────┬────────────────────────────────────────────┘
                                │ service-role key (server only, RLS denies anon)
                       ┌────────▼─────────┐
                       │ Supabase Postgres │ binder_items · wishlist_items ·
                       │                   │ trades · trade_lines · price_snapshots
                       └───────────────────┘
```

**Scan flow:** shutter → best-of-4 frame crop → `/api/scan` → model returns structured JSON
(localized + English name, set name/code, number like `025/165`, language, rarity, printing
variant, slab company/grade, confidence) → catalog match ranked by collector number (50),
printed set total (25), name (15), set (10) → price for the top match → result sheet where you
can correct the printing variant or pick another match (both re-price instantly).

**Pricing priority:** English prints use TCGplayer → PriceCharting → Cardmarket → eBay. Japanese,
Korean and Chinese prints use PriceCharting → eBay → Cardmarket. Quotes that matched the exact
printing win; if the primary deviates more than 60% from the median of 3+ sources, the median
is used. Poké Ball / Master Ball reverses are flagged low-confidence when only the generic reverse
price exists.

**Trade math** (`src/lib/trade/math.ts`, unit-tested):
`value = market × condition weight × side preset %`. Slabs use the graded price and skip
condition weights; a sticker/agreed price overrides both. Net = what you get − what you give
(cash included). The gauge is green / amber / red around a configurable ±fair band (default 5%).

---

## 2. File tree

```
tradedesk/
├─ .env.example                  env template (copy to .env.local / Vercel)
├─ vercel.json                   daily Cron → /api/cron/snapshot
├─ next.config.ts                security + SW/manifest headers
├─ supabase/schema.sql           tables, enums, RLS lock-down, complete_trade() RPC
├─ scripts/generate-pwa-assets.mjs   icons + 12 iPhone splash screens (sharp)
├─ tests/trade-math.test.ts      node:test unit tests
├─ public/
│  ├─ manifest.json  sw.js  robots.txt  favicon.ico
│  ├─ icons/   apple-touch-icon.png, icon-192/512, maskable-512
│  └─ splash/  splash-<W>x<H>.png for every current iPhone size
└─ src/
   ├─ proxy.ts                   passcode gate (Next 16 "proxy", formerly middleware)
   ├─ app/
   │  ├─ layout.tsx              metadata, apple-web-app, startup images, viewport-fit=cover
   │  ├─ globals.css             Tailwind v4 theme tokens + safe-area utilities
   │  ├─ page.tsx                Trade Desk (home)
   │  ├─ scan/ binder/ wishlist/ history/ settings/ unlock/   page.tsx each
   │  └─ api/
   │     ├─ scan/route.ts        camera → vision → catalog → price
   │     ├─ search/route.ts      autocomplete
   │     ├─ prices/route.ts      batched price aggregation
   │     ├─ fx/route.ts          USD/GBP/EUR/JPY
   │     ├─ binder/route.ts  binder/[id]/route.ts  binder/reprice/route.ts
   │     ├─ wishlist/route.ts  wishlist/[id]/route.ts
   │     ├─ trades/route.ts      history + atomic completion
   │     ├─ auth/route.ts        unlock / lock
   │     └─ cron/snapshot/route.ts
   ├─ components/
   │  ├─ trade/   TradeDesk, TradeLineTile, EquityGauge, LineEditSheet,
   │  │           BinderPickerSheet, TermsSheets (presets/cash), CompleteTradeSheet
   │  ├─ scanner/ CameraScanner, ScanHub
   │  ├─ search/  CardSearchSheet
   │  ├─ binder/  BinderView (summary, filters, 4/9-pocket grid, item sheet)
   │  ├─ price/   PriceBreakdown, Sparkline
   │  ├─ wishlist/ history/ settings/ nav/ pwa/ ui/
   │  └─ AppProviders.tsx        SW registration, FX bootstrap, store rehydration
   ├─ hooks/useMoney.ts          currency formatting, FX, trade price loader
   ├─ store/                     trade (persisted), settings (persisted), data, toast
   └─ lib/
      ├─ types.ts                shared domain types + helpers
      ├─ trade/math.ts           presets, condition weights, totals, equity
      ├─ client/                 api client, camera/image pipeline, wishlist matcher
      └─ server/                 env, vision, catalog/, pricing/, fx, db, session, validate
```

---

## 3. Setup

### 3.1 Prerequisites
Node.js ≥ 20.9, a Supabase project (free tier is fine), an Anthropic API key (or Gemini key).

```bash
npm install
cp .env.example .env.local      # fill in the values below
npm run dev                     # http://localhost:3000
npm test                        # trade-math unit tests
```

### 3.2 Database (Supabase)
1. Create a project at supabase.com.
2. **SQL Editor → New query →** paste `supabase/schema.sql` → Run.
3. **Project Settings → API:** copy the Project URL to `SUPABASE_URL` and the
   **service_role** key to `SUPABASE_SERVICE_ROLE_KEY`.

RLS is on with no policies, so the public anon key can't touch anything; only the server
(service role, behind your passcode) reads and writes. The schema is plain Postgres, so it also
runs on Neon. Swap `src/lib/server/db.ts` for a `postgres`/`@neondatabase/serverless` client if you
go that way.

### 3.3 Environment variables

| Variable | Required | Notes |
|---|---|---|
| `APP_PASSCODE` | yes (prod) | Locks the app so nobody at the show burns your API credits |
| `SESSION_SECRET` | yes (prod) | `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | one vision key | Default provider |
| `ANTHROPIC_VISION_MODEL` | no | Default `claude-sonnet-5-5`; `claude-haiku-4-5` for speed/cost |
| `VISION_PROVIDER` | no | `anthropic` (default) or `gemini`; the other is used as fallback if configured |
| `GEMINI_API_KEY`, `GEMINI_VISION_MODEL` | optional | Set the model to the current Flash model on your account |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | for binder/wishlist/history | The trade desk works without them |
| `PRICECHARTING_TOKEN` | recommended for JP/KO/CN | Paid API subscription |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | optional | developer.ebay.com, production keyset |
| `EBAY_MARKETPLACE_ID` | optional | `EBAY_US`, `EBAY_GB`, … |
| `EBAY_USE_MARKETPLACE_INSIGHTS` | optional | `1` only if eBay approved your app for sold-listing data |
| `CRON_SECRET` | for the daily snapshot | `openssl rand -hex 32` |

---

## 4. Deploy to Vercel

1. Push the folder to a GitHub repo.
2. vercel.com → **Add New → Project →** import the repo. Framework is auto-detected; no build
   settings to change.
3. **Settings → Environment Variables:** add everything from the table (Production + Preview).
4. Deploy. `vercel.json` registers the daily Cron (06:15 UTC) that re-prices the binder and
   writes `price_snapshots`, which powers the history sparkline and 7d/30d trends.

CLI alternative:
```bash
npm i -g vercel
vercel link
vercel env add ANTHROPIC_API_KEY   # repeat per variable
vercel --prod
```

Function limits used: `/api/scan` 30 s, `/api/prices` 30 s, `/api/binder/reprice` 60 s,
`/api/cron/snapshot` 300 s.

### Install on the iPhone
Open the deployed URL in **Safari → Share → Add to Home Screen**. It launches full-screen with
the splash screen, safe-area padding around the Dynamic Island and home indicator, and a black
translucent status bar. Allow camera access the first time you scan (if you denied it: long-press
the icon or Settings → Apps → Safari → Camera).

---

## 5. API reference

| Route | Method | Body / query | Returns |
|---|---|---|---|
| `/api/scan` | POST | `{ image: base64 jpeg, languageHint?: "JA" }` | `{ identity, matches[], price, grade, timings }` |
| `/api/search` | GET | `?q=charizard 199&lang=EN` | `{ results: CardRef[] }` |
| `/api/prices` | POST | `{ items: [{ card, grade? }], fresh?, history? }` | `{ prices: { [priceKey]: AggregatedPrice } }` |
| `/api/fx` | GET | – | `{ base: "USD", rates: {USD,GBP,EUR,JPY}, stale }` |
| `/api/binder` | GET / POST | POST `{ card, condition, grade?, quantity?, priceUsd? }` | items / item (merges duplicates) |
| `/api/binder/:id` | PATCH / DELETE | `{ condition?, quantity?, forTrade?, grade?, variant? }` | item |
| `/api/binder/reprice` | POST | – | `{ updated, failed, remaining }` |
| `/api/wishlist` | GET / POST | POST `{ card, anyLanguage?, maxPriceUsd?, priority? }` | items / item |
| `/api/trades` | GET / POST | POST: totals + lines (see `CompleteTradeSheet.tsx`) | history / `{ id }` |
| `/api/auth` | POST / DELETE | `{ passcode }` | sets / clears session cookie |
| `/api/cron/snapshot` | GET | `Authorization: Bearer $CRON_SECRET` | re-price summary |

---

## 6. Using it at a show

1. **Trade tab.** Left (violet) is what you give; right (teal) is what you get.
2. Left: **Binder** (multi-select from cards marked for trade), **Scan**, or **Find**.
   Right: **Scan theirs** — the scanner stays open so you can rattle through a stack.
3. Tap a card's condition pill to cycle NM → LP → MP → HP → DMG. Tap the card for sources,
   trend, history, slab grade, printing, quantity, or a **sticker price** the dealer quoted.
4. Pick the deal type: **1:1 Market**, **Store Credit 80%**, **Shop Cash 70%**,
   **Show Dealer 85/110**, or custom margins. Add cash, or tap **Even it out**.
5. Any card on the right that matches your wishlist turns gold with a banner.
6. **Done** → share the summary with the other trader, then save. Offered binder cards are
   removed and received cards added in one transaction.

Dim hall tips: torch button (where iOS exposes it), tilt the sleeve ~10° to move glare off the
number, or use **Find** — `pikachu 25`, `リザードン`, `피카츄` all work.

---

## 7. Honest limitations

- **TCGplayer's public API is closed to new developers.** TCGplayer prices come through TCGdex,
  which is free and updated roughly hourly. Scrydex (the paid successor to pokemontcg.io) is a
  drop-in option if you want graded prices and longer history: add a provider in
  `src/lib/server/pricing/` returning `PriceQuote`.
- **eBay sold listings** need the Marketplace Insights API, which eBay grants case by case.
  Without it the app shows a trimmed median of active Buy-It-Now listings, labelled
  *asking*. Scraping eBay's sold pages isn't used: it breaks eBay's terms and is blocked from
  Vercel anyway.
- **Korean and Simplified Chinese** catalog coverage on TCGdex is still growing. Unmatched cards
  are matched to the English print for the image and name, keep their printed number, and are
  priced from PriceCharting/eBay rather than English markets.
- Vision results include a confidence score; under 60% or with a model note, the result sheet
  shows an amber warning. Always eyeball the collector number before you shake hands.
- Torch control depends on iOS exposing it to Safari; the button greys out when unavailable.
- Prices are guidance for negotiation, not appraisals.
