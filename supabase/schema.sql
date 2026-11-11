-- semi-cobot hosted storage. Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- One small key-value table: the account document, wrong-password counters (expire after 15 minutes)
-- and the part-info cache (90 days). Only the server's secret key can use it: row level security is on
-- with no policies, and the public (publishable/anon) roles get no table or function rights.

create table if not exists public.semicobot_kv (
  key        text primary key,
  value      text not null,
  expires_at timestamptz
);

alter table public.semicobot_kv enable row level security;
revoke all on table public.semicobot_kv from anon, authenticated;

-- Atomic counter with an expiry window that starts at the first increment; an expired count starts again at 1.
-- Each call also clears rows that expired over a day ago, so the table cannot grow without bound.
create or replace function public.semicobot_incr(k text, ttl_seconds integer)
returns integer
language sql
set search_path = ''
as $$
  delete from public.semicobot_kv where expires_at < now() - interval '1 day';
  insert into public.semicobot_kv as t (key, value, expires_at)
  values (k, '1', now() + make_interval(secs => ttl_seconds))
  on conflict (key) do update set
    value      = case when t.expires_at is not null and t.expires_at <= now() then '1'
                      else (t.value::integer + 1)::text end,
    expires_at = case when t.expires_at is not null and t.expires_at <= now()
                      then now() + make_interval(secs => ttl_seconds) else t.expires_at end
  returning value::integer;
$$;

revoke execute on function public.semicobot_incr(text, integer) from public, anon, authenticated;
grant execute on function public.semicobot_incr(text, integer) to service_role;
grant all on table public.semicobot_kv to service_role;

-- Make the new table and function visible to the REST API straight away.
notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Shared inventory: one company stock for everyone who signs in, plus purchase orders, the stock-move log
-- and how many boards of each production job have already taken their components. Only the server (secret
-- key) reads and writes these, through /api/inventory after it has checked the sign-in session. Row level
-- security is on with no policies, so the publishable key sees nothing. Safe to run again.

create table if not exists public.inventory_parts (
  id          text primary key,
  mpn         text not null,
  manufacturer text not null default '',
  category    text not null default '',
  description text not null default '',
  package     text not null default '',
  location    text not null default '',
  lifecycle   text not null default '',
  supplier    text not null default '',
  source      text not null default '',
  stock       integer not null default 0 check (stock >= 0),
  min_stock   integer not null default 0 check (min_stock >= 0),
  price_usd   numeric not null default 0 check (price_usd >= 0),
  specs       jsonb not null default '{}'::jsonb,
  extra       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text not null default ''
);
create unique index if not exists inventory_parts_mpn_key on public.inventory_parts (upper(mpn));

create table if not exists public.purchase_orders (
  id           text primary key,
  supplier     text not null default '',
  project      text not null default '',
  list_id      text,
  lines        jsonb not null default '[]'::jsonb,
  shipping_usd numeric not null default 0,
  total_usd    numeric not null default 0,
  status       text not null default 'ordered' check (status in ('ordered','received')),
  ordered_at   timestamptz not null default now(),
  received_at  timestamptz,
  updated_by   text not null default ''
);

create table if not exists public.stock_moves (
  id       text primary key,
  at       timestamptz not null default now(),
  type     text not null check (type in ('in','out')),
  mpn      text not null,
  qty      integer not null check (qty >= 0),
  cost_usd numeric,
  ref      text not null default '',
  note     text not null default '',
  by_user  text not null default ''
);
create index if not exists stock_moves_at on public.stock_moves (at desc);

create table if not exists public.production_consumed (
  job_id     text primary key,
  boards     integer not null default 0 check (boards >= 0),
  updated_at timestamptz not null default now()
);

alter table public.inventory_parts     enable row level security;
alter table public.purchase_orders     enable row level security;
alter table public.stock_moves         enable row level security;
alter table public.production_consumed enable row level security;
revoke all on table public.inventory_parts, public.purchase_orders, public.stock_moves, public.production_consumed from anon, authenticated;
grant all on table public.inventory_parts, public.purchase_orders, public.stock_moves, public.production_consumed to service_role;

-- Applies the changes one browser made since it last synced, in one transaction. Stock is sent as a
-- change (+600 received, −18 used), never as a total, so two people working at once both count. A new
-- part whose part number is already in stock is merged into that part instead of making a second one:
-- its stock is added and the details already there are kept.
-- changes: [{id, op:'delete'} | {id, row?:{mpn, manufacturer, …, min_stock, price_usd, specs, extra}, delta}]
create or replace function public.inventory_apply(changes jsonb, who text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  c jsonb;
  r public.inventory_parts;
  target text;
  by_mpn boolean;
  d integer;
begin
  for c in select value from jsonb_array_elements(coalesce(changes, '[]'::jsonb)) loop
    if c->>'op' = 'delete' then
      delete from public.inventory_parts where id = c->>'id';
      continue;
    end if;
    d := coalesce((c->>'delta')::integer, 0);
    target := null;
    by_mpn := false;
    select p.id into target from public.inventory_parts p where p.id = c->>'id';
    if target is null and c ? 'row' then
      select p.id into target from public.inventory_parts p where upper(p.mpn) = upper(c->'row'->>'mpn');
      by_mpn := target is not null;
    end if;
    if c ? 'row' then
      r := jsonb_populate_record(null::public.inventory_parts, c->'row');
    end if;
    if target is null then
      if not (c ? 'row') or coalesce(r.mpn, '') = '' then continue; end if;
      insert into public.inventory_parts (id, mpn, manufacturer, category, description, package, location, lifecycle,
        supplier, source, stock, min_stock, price_usd, specs, extra, updated_at, updated_by)
      values (c->>'id', r.mpn, coalesce(r.manufacturer, ''), coalesce(r.category, ''), coalesce(r.description, ''),
        coalesce(r.package, ''), coalesce(r.location, ''), coalesce(r.lifecycle, ''), coalesce(r.supplier, ''),
        coalesce(r.source, ''), greatest(0, d), greatest(0, coalesce(r.min_stock, 0)), greatest(0, coalesce(r.price_usd, 0)),
        coalesce(r.specs, '{}'::jsonb), coalesce(r.extra, '{}'::jsonb), now(), coalesce(who, ''));
    elsif c ? 'row' and not by_mpn then
      update public.inventory_parts p set
        mpn = coalesce(nullif(r.mpn, ''), p.mpn), manufacturer = coalesce(r.manufacturer, p.manufacturer),
        category = coalesce(r.category, p.category), description = coalesce(r.description, p.description),
        package = coalesce(r.package, p.package), location = coalesce(r.location, p.location),
        lifecycle = coalesce(r.lifecycle, p.lifecycle), supplier = coalesce(r.supplier, p.supplier),
        source = coalesce(r.source, p.source), min_stock = greatest(0, coalesce(r.min_stock, p.min_stock)),
        price_usd = greatest(0, coalesce(r.price_usd, p.price_usd)), specs = coalesce(r.specs, p.specs),
        extra = coalesce(r.extra, p.extra), stock = greatest(0, p.stock + d), updated_at = now(), updated_by = coalesce(who, '')
      where p.id = target;
    elsif d <> 0 then
      update public.inventory_parts p set stock = greatest(0, p.stock + d), updated_at = now(), updated_by = coalesce(who, '')
      where p.id = target;
    end if;
  end loop;
end;
$$;

-- Purchase orders, stock moves and consumed-board counts in one transaction. An order number that someone
-- else already used for a different order gets a suffix (-2, -3 …) instead of overwriting theirs; a
-- received order never goes back to ordered; only orders still waiting can be cancelled; a stock move is
-- written once; a job's consumed count only goes up.
create or replace function public.ledger_apply(orders jsonb, removed jsonb, moves jsonb, consumed jsonb, who text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  o jsonb;
  m jsonb;
  k text;
  oid text;
  n integer;
  existing public.purchase_orders;
begin
  for o in select value from jsonb_array_elements(coalesce(orders, '[]'::jsonb)) loop
    oid := o->>'id';
    n := 1;
    loop
      select * into existing from public.purchase_orders where id = oid;
      exit when not found or existing.ordered_at = (o->>'ordered_at')::timestamptz;
      n := n + 1;
      oid := (o->>'id') || '-' || n;
    end loop;
    insert into public.purchase_orders as t (id, supplier, project, list_id, lines, shipping_usd, total_usd, status, ordered_at, received_at, updated_by)
    values (oid, coalesce(o->>'supplier', ''), coalesce(o->>'project', ''), o->>'list_id', coalesce(o->'lines', '[]'::jsonb),
      coalesce((o->>'shipping_usd')::numeric, 0), coalesce((o->>'total_usd')::numeric, 0),
      case when o->>'status' = 'received' then 'received' else 'ordered' end,
      coalesce((o->>'ordered_at')::timestamptz, now()), (o->>'received_at')::timestamptz, coalesce(who, ''))
    on conflict (id) do update set
      status = case when t.status = 'received' then 'received' else excluded.status end,
      received_at = coalesce(t.received_at, excluded.received_at),
      lines = case when t.status = 'received' then t.lines else excluded.lines end,
      total_usd = case when t.status = 'received' then t.total_usd else excluded.total_usd end,
      updated_by = excluded.updated_by;
  end loop;

  delete from public.purchase_orders
  where status = 'ordered' and id in (select jsonb_array_elements_text(coalesce(removed, '[]'::jsonb)));

  for m in select value from jsonb_array_elements(coalesce(moves, '[]'::jsonb)) loop
    insert into public.stock_moves (id, at, type, mpn, qty, cost_usd, ref, note, by_user)
    values (m->>'id', coalesce((m->>'at')::timestamptz, now()), m->>'type', m->>'mpn', greatest(0, coalesce((m->>'qty')::integer, 0)),
      (m->>'cost_usd')::numeric, coalesce(m->>'ref', ''), coalesce(m->>'note', ''), coalesce(who, ''))
    on conflict (id) do nothing;
  end loop;

  for k in select jsonb_object_keys(coalesce(consumed, '{}'::jsonb)) loop
    insert into public.production_consumed as t (job_id, boards, updated_at)
    values (k, greatest(0, (consumed->>k)::integer), now())
    on conflict (job_id) do update set boards = greatest(t.boards, excluded.boards), updated_at = now();
  end loop;
end;
$$;

revoke execute on function public.inventory_apply(jsonb, text) from public, anon, authenticated;
revoke execute on function public.ledger_apply(jsonb, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.inventory_apply(jsonb, text) to service_role;
grant execute on function public.ledger_apply(jsonb, jsonb, jsonb, jsonb, text) to service_role;

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Part master. part_master is the reference catalogue (Semiconductor & Resistor Part Master: semiconductors
-- and resistors, one row per part number), loaded with `node --env-file=.env scripts/push-part-master.mjs`
-- and editable in the Table Editor; the app reads it through /api/partmaster. part_details holds the details
-- the team adds: parts learned from Gerber sets and BOMs, online look-ups and imports, shared by everyone.
-- Only the server (secret key) reads and writes them. Safe to run again.

create table if not exists public.part_master (
  kind         text not null check (kind in ('semiconductor','resistor')),
  mpn          text not null,
  sort         integer not null default 0,
  category     text not null default '',
  sub_type     text not null default '',
  manufacturer text not null default '',
  description  text not null default '',
  specs        text not null default '',
  package      text not null default '',
  mount        text not null default '',
  use_case     text not null default '',
  alternates   text not null default '',
  size         text not null default '',
  value        text not null default '',
  ohms         double precision,
  tolerance    text not null default '',
  power        text not null default '',
  max_v        text not null default '',
  tcr          text not null default '',
  cross_ref    text not null default '',
  packaging    text not null default '',
  updated_at   timestamptz not null default now(),
  primary key (kind, mpn)
);

create table if not exists public.part_details (
  key          text primary key check (key ~ '^[A-Z0-9]{1,100}$'),
  mpn          text not null,
  manufacturer text not null default '',
  description  text not null default '',
  package      text not null default '',
  source       text not null default '',
  data         jsonb not null,
  updated_at   timestamptz not null default now(),
  updated_by   text not null default ''
);

alter table public.part_master  enable row level security;
alter table public.part_details enable row level security;
revoke all on table public.part_master, public.part_details from anon, authenticated;
grant all on table public.part_master, public.part_details to service_role;

notify pgrst, 'reload schema';
