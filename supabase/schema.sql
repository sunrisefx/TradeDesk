-- ════════════════════════════════════════════════════════════════════════════
-- TradeDesk — Supabase / PostgreSQL schema
-- Run once in Supabase → SQL Editor (or `psql $DATABASE_URL -f supabase/schema.sql`).
-- Works unchanged on Neon or any Postgres ≥ 14 (only the RLS lines are Supabase-flavoured).
--
-- Security model: single-owner app. Row Level Security is ENABLED with NO
-- policies, so the public anon key can read/write nothing. All access goes
-- through Next.js route handlers using the service-role key, behind APP_PASSCODE.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Enums ───────────────────────────────────────────────────────────────────
do $$ begin
  create type card_language as enum ('EN','JA','KO','ZH-CN','ZH-TW');
exception when duplicate_object then null; end $$;

do $$ begin
  create type card_condition as enum ('NM','LP','MP','HP','DMG');
exception when duplicate_object then null; end $$;

do $$ begin
  create type trade_side as enum ('offer','receive');
exception when duplicate_object then null; end $$;

-- ── Binder / inventory ──────────────────────────────────────────────────────
create table if not exists binder_items (
  id               uuid primary key default gen_random_uuid(),
  card_key         text not null,              -- stable key: catalogId|language|variant
  catalog_id       text,                       -- TCGdex id, e.g. sv03.5-025
  catalog_lang     text,                       -- TCGdex language code used for lookup
  name             text not null,              -- localized name as printed
  name_en          text not null,              -- English equivalent
  set_id           text,
  set_name         text,
  set_code         text,
  number           text,                       -- as printed, e.g. 025/165
  language         card_language not null default 'EN',
  rarity           text,
  variant          text not null default 'normal',
  image_url        text,
  condition        card_condition not null default 'NM',
  grading_company  text,                       -- PSA / BGS / CGC / SGC / ACE ...
  grade            numeric(3,1),
  quantity         integer not null default 1 check (quantity > 0),
  for_trade        boolean not null default true,
  purchase_usd     numeric(12,2),
  last_price_usd   numeric(12,2),
  last_priced_at   timestamptz,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists binder_items_card_key_idx on binder_items (card_key);
create index if not exists binder_items_language_idx on binder_items (language);
create index if not exists binder_items_set_idx      on binder_items (set_name);
create index if not exists binder_items_value_idx    on binder_items (last_price_usd desc nulls last);

-- ── Wishlist ────────────────────────────────────────────────────────────────
create table if not exists wishlist_items (
  id             uuid primary key default gen_random_uuid(),
  card_key       text,
  catalog_id     text,
  name           text not null,
  name_en        text not null,
  set_name       text,
  number         text,
  language       card_language,              -- null = any language
  variant        text,                       -- null = any variant
  image_url      text,
  max_price_usd  numeric(12,2),
  priority       smallint not null default 2 check (priority between 1 and 3),
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists wishlist_items_catalog_idx on wishlist_items (catalog_id);
create index if not exists wishlist_items_name_idx    on wishlist_items (lower(name_en));

-- ── Trades ──────────────────────────────────────────────────────────────────
create table if not exists trades (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  location           text,
  counterparty       text,
  preset             jsonb not null,           -- { id, label, offerPct, receivePct }
  display_currency   text not null default 'USD',
  fx_rate            numeric(14,6) not null default 1,
  offered_total_usd  numeric(12,2) not null,
  received_total_usd numeric(12,2) not null,
  cash_delta_usd     numeric(12,2) not null default 0,  -- + = cash you received
  net_usd            numeric(12,2) not null,
  equity             text not null,            -- favorable | fair | unfavorable
  notes              text
);

create table if not exists trade_lines (
  id               uuid primary key default gen_random_uuid(),
  trade_id         uuid not null references trades(id) on delete cascade,
  side             trade_side not null,
  card             jsonb not null,             -- full CardRef snapshot
  condition        card_condition not null,
  quantity         integer not null default 1,
  market_usd       numeric(12,2),
  adjusted_usd     numeric(12,2) not null,
  binder_item_id   uuid references binder_items(id) on delete set null
);

create index if not exists trade_lines_trade_idx on trade_lines (trade_id);

-- ── Price history (filled by Vercel Cron + every live lookup) ───────────────
create table if not exists price_snapshots (
  card_key     text not null,
  captured_on  date not null default current_date,
  usd          numeric(12,2) not null,
  sources      jsonb,
  primary key (card_key, captured_on)
);

-- ── updated_at trigger ──────────────────────────────────────────────────────
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists binder_items_touch on binder_items;
create trigger binder_items_touch before update on binder_items
  for each row execute function touch_updated_at();

-- ── Atomic "complete trade" ─────────────────────────────────────────────────
-- Records the trade, removes/decrements offered binder cards and adds received
-- cards to the binder — all in one transaction so a dropped convention Wi-Fi
-- connection can never leave the binder half-updated.
create or replace function complete_trade(payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t_id uuid;
  line jsonb;
  card jsonb;
  qty int;
  bid uuid;
begin
  insert into trades (location, counterparty, preset, display_currency, fx_rate,
                      offered_total_usd, received_total_usd, cash_delta_usd, net_usd, equity, notes)
  values (payload->>'location', payload->>'counterparty', payload->'preset',
          coalesce(payload->>'displayCurrency','USD'), coalesce((payload->>'fxRate')::numeric, 1),
          (payload->>'offeredTotalUsd')::numeric, (payload->>'receivedTotalUsd')::numeric,
          coalesce((payload->>'cashDeltaUsd')::numeric, 0),
          (payload->>'netUsd')::numeric, payload->>'equity', payload->>'notes')
  returning id into t_id;

  for line in select * from jsonb_array_elements(payload->'lines') loop
    card := line->'card';
    qty  := greatest(coalesce((line->>'quantity')::int, 1), 1);
    bid  := nullif(line->>'binderItemId','')::uuid;

    insert into trade_lines (trade_id, side, card, condition, quantity, market_usd, adjusted_usd, binder_item_id)
    values (t_id, (line->>'side')::trade_side, card, (line->>'condition')::card_condition, qty,
            nullif(line->>'marketUsd','')::numeric, (line->>'adjustedUsd')::numeric, bid);

    if line->>'side' = 'offer' and bid is not null then
      update binder_items set quantity = quantity - qty where id = bid and quantity > qty;
      if not found then delete from binder_items where id = bid; end if;
    elsif line->>'side' = 'receive' and coalesce((payload->>'addReceivedToBinder')::boolean, true) then
      insert into binder_items (card_key, catalog_id, catalog_lang, name, name_en, set_id, set_name, set_code,
                                number, language, rarity, variant, image_url, condition, quantity,
                                purchase_usd, last_price_usd, last_priced_at)
      values (line->>'cardKey', card->>'catalogId', card->>'catalogLang', card->>'name', card->>'nameEn',
              card->>'setId', card->>'setName', card->>'setCode', card->>'number',
              (card->>'language')::card_language, card->>'rarity', coalesce(card->>'variant','normal'),
              card->>'imageUrl', (line->>'condition')::card_condition, qty,
              (line->>'adjustedUsd')::numeric / qty, nullif(line->>'marketUsd','')::numeric, now());
    end if;
  end loop;

  return t_id;
end $$;

-- ── Lock everything down (service role bypasses RLS) ────────────────────────
alter table binder_items    enable row level security;
alter table wishlist_items  enable row level security;
alter table trades          enable row level security;
alter table trade_lines     enable row level security;
alter table price_snapshots enable row level security;

revoke execute on function complete_trade(jsonb) from public;
do $$ begin
  -- Supabase roles; skipped automatically on plain Postgres / Neon.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function complete_trade(jsonb) from anon, authenticated';
    execute 'grant execute on function complete_trade(jsonb) to service_role';
  end if;
end $$;
