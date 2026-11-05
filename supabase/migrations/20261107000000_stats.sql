-- =====================================================================
-- Phase 5: stats and streaks
-- =====================================================================

-- Profiles store an IANA zone from the device; fall back to UTC if it's unknown to Postgres.
create or replace function public.safe_timezone(tz text)
returns text language sql stable as $$
  select case when exists (select 1 from pg_timezone_names where name = tz) then tz else 'UTC' end;
$$;

-- Stats for a user. Callable by the user, their accepted partners, or the service role.
--   streak_days       full days (incl. today) since the last approved extension (normal or emergency)
--   best_streak_days  longest such run since the account was created
--   week_*            last 7 days of requests
--   partner_*         how this user behaves as a partner (last 30 days)
create or replace function public.user_stats(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  tz         text;
  today      date;
  start_day  date;
  last_ext   date;
  streak     int;
  best       int;
  week       jsonb;
  partner    jsonb;
begin
  if auth.uid() is not null and auth.uid() <> p_user and not is_accepted_partner(p_user, auth.uid()) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  select safe_timezone(timezone), (created_at at time zone safe_timezone(timezone))::date
    into tz, start_day
    from profiles where id = p_user;
  if tz is null then
    return null;
  end if;
  today := (now() at time zone tz)::date;

  -- Days on which an extension was granted.
  with ext_days as (
    select distinct (decided_at at time zone tz)::date as d
      from extension_requests
     where requester_id = p_user and status = 'approved' and decided_at is not null
  ),
  ordered as (
    select d, lag(d) over (order by d) as prev from ext_days
  ),
  gaps as (
    -- run before the first extension day
    select (min(d) - start_day) as len from ext_days
    union all
    -- runs between extension days
    select (d - prev - 1) from ordered where prev is not null
  )
  select max(d), coalesce(max(len), 0)
    into last_ext, best
    from ext_days, gaps;

  if last_ext is null then
    streak := today - start_day + 1;
    best := streak;
  else
    streak := today - last_ext;
    best := greatest(best, streak);
  end if;

  select jsonb_build_object(
           'requests',        count(*),
           'approved',        count(*) filter (where status = 'approved' and not emergency),
           'denied',          count(*) filter (where status = 'denied'),
           'expired',         count(*) filter (where status = 'expired'),
           'emergencies',     count(*) filter (where emergency),
           'minutes_granted', coalesce(sum(minutes_granted) filter (where status = 'approved'), 0)
         )
    into week
    from extension_requests
   where requester_id = p_user and created_at > now() - interval '7 days';

  select jsonb_build_object(
           'votes',               count(*),
           'approvals',           count(*) filter (where v.decision = 'approve'),
           'avg_response_minutes', round(avg(extract(epoch from v.created_at - r.created_at) / 60)::numeric, 1)
         )
    into partner
    from request_votes v
    join extension_requests r on r.id = v.request_id
   where v.voter_id = p_user and v.created_at > now() - interval '30 days';

  return jsonb_build_object(
    'streak_days',      greatest(streak, 0),
    'best_streak_days', greatest(best, 0),
    'week',             week,
    'partner',          partner
  );
end $$;

revoke execute on function public.user_stats(uuid) from public, anon;
grant  execute on function public.user_stats(uuid) to authenticated, service_role;
