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
