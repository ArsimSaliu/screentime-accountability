-- =====================================================================
-- Phase 4: hardening
--   * loosening a limit (or deleting / pausing it) takes effect after 24 h
--   * removing an accepted partner takes effect after 24 h
--   * emergency ("break-glass") unlock: max 15 min, once per 24 h, partners alerted
--   * tamper events (Screen Time access revoked) + last-seen heartbeat
-- =====================================================================

-- ---------- Columns ----------
alter table public.limits
  add column pending_change       jsonb,
  add column pending_effective_at timestamptz;

alter table public.partnerships
  add column removal_effective_at timestamptz;

alter table public.extension_requests
  add column emergency boolean not null default false;

alter table public.profiles
  add column last_seen_at       timestamptz,
  add column screen_time_status text check (screen_time_status in ('approved', 'denied', 'notDetermined'));

-- ---------- Tamper events ----------
create table public.tamper_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('screen_time_revoked', 'screen_time_restored')),
  created_at timestamptz not null default now()
);
create index on public.tamper_events (user_id, created_at desc);
alter table public.tamper_events enable row level security;

create policy "own or partner tamper events" on public.tamper_events
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_accepted_partner(user_id, (select auth.uid())));

-- ---------- Helpers ----------
create or replace function public.strictness_rank(s public.strictness)
returns int language sql immutable as $$
  select case s when 'relaxed' then 0 when 'standard' then 1 when 'strict' then 2 else 3 end;
$$;

-- True while server-side code (cron / triggers) is applying queued changes.
create or replace function public.leash_applying()
returns boolean language sql stable as $$
  select coalesce(current_setting('leash.applying', true), '') = 'on';
$$;

-- ---------- Limits: tighten now, loosen later ----------
create or replace function public.guard_limit_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pend     jsonb;
  loosened boolean := false;
begin
  -- Only app users are guarded; server code, cron and the service role pass through.
  if leash_applying() or auth.uid() is null then
    return new;
  end if;

  -- pending_* columns are server-managed. The only thing a client may do is clear them (cancel).
  if new.pending_change is null and old.pending_change is not null then
    pend := '{}'::jsonb;
  elsif new.pending_change is distinct from old.pending_change
     or new.pending_effective_at is distinct from old.pending_effective_at then
    raise exception 'Scheduled changes are managed by the server' using errcode = 'P0001';
  else
    pend := coalesce(old.pending_change, '{}'::jsonb);
  end if;

  -- Relaxed limits can be changed freely (that's what "relaxed" means).
  if old.strictness = 'relaxed' then
    new.pending_change := null;
    new.pending_effective_at := null;
    return new;
  end if;

  -- For each field: a looser value is queued (and the current value kept);
  -- a stricter value applies immediately and drops any queued loosening of that field.
  if new.minutes > old.minutes then
    pend := pend || jsonb_build_object('minutes', new.minutes); new.minutes := old.minutes; loosened := true;
  elsif new.minutes < old.minutes then
    pend := pend - 'minutes';
  end if;

  if new.approvals_required < old.approvals_required then
    pend := pend || jsonb_build_object('approvals_required', new.approvals_required);
    new.approvals_required := old.approvals_required; loosened := true;
  elsif new.approvals_required > old.approvals_required then
    pend := pend - 'approvals_required';
  end if;

  if strictness_rank(new.strictness) < strictness_rank(old.strictness) then
    pend := pend || jsonb_build_object('strictness', new.strictness);
    new.strictness := old.strictness; loosened := true;
  elsif strictness_rank(new.strictness) > strictness_rank(old.strictness) then
    pend := pend - 'strictness';
  end if;

  if old.active and not new.active then
    pend := pend || jsonb_build_object('active', false); new.active := true; loosened := true;
  elsif not old.active and new.active then
    pend := pend - 'active';
  end if;

  -- Session limits don't block on iOS yet, so daily -> session counts as loosening.
  if old.kind = 'daily' and new.kind = 'session' then
    pend := pend || jsonb_build_object('kind', 'session'); new.kind := old.kind; loosened := true;
  elsif old.kind = 'session' and new.kind = 'daily' then
    pend := pend - 'kind';
  end if;

  if pend = '{}'::jsonb then
    new.pending_change := null;
    new.pending_effective_at := null;
  else
    new.pending_change := pend;
    new.pending_effective_at := case when loosened then now() + interval '24 hours' else old.pending_effective_at end;
  end if;
  return new;
end $$;

create trigger guard_limit_update
  before update on public.limits
  for each row execute function public.guard_limit_update();

-- New limits can't be created already-loose in a way that matters, but block
-- clients from inserting server-managed fields.
create or replace function public.guard_limit_insert()
returns trigger language plpgsql as $$
begin
  new.pending_change := null;
  new.pending_effective_at := null;
  return new;
end $$;

create trigger guard_limit_insert
  before insert on public.limits
  for each row execute function public.guard_limit_insert();

-- Deleting an active, non-relaxed limit schedules the deletion instead.
create or replace function public.guard_limit_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Server-side apply, cascades from account deletion, relaxed or paused limits: delete now.
  if leash_applying() or auth.uid() is null or pg_trigger_depth() > 1
     or old.strictness = 'relaxed' or not old.active then
    return old;
  end if;

  perform set_config('leash.applying', 'on', true);
  update limits
     set pending_change = jsonb_build_object('delete', true),
         pending_effective_at = now() + interval '24 hours'
   where id = old.id;
  perform set_config('leash.applying', 'off', true);
  return null; -- skip the actual delete
end $$;

create trigger guard_limit_delete
  before delete on public.limits
  for each row execute function public.guard_limit_delete();

-- ---------- Partnerships: owner removing an accepted partner waits 24 h ----------
create or replace function public.guard_partnership_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if leash_applying() or pg_trigger_depth() > 1 then
    return old;
  end if;
  -- Pending invites, and partners leaving on their own, are immediate.
  if old.status <> 'accepted' or auth.uid() is distinct from old.owner_id then
    return old;
  end if;
  if old.removal_effective_at is null then
    perform set_config('leash.applying', 'on', true);
    update partnerships set removal_effective_at = now() + interval '24 hours' where id = old.id;
    perform set_config('leash.applying', 'off', true);
  end if;
  return null;
end $$;

create trigger guard_partnership_delete
  before delete on public.partnerships
  for each row execute function public.guard_partnership_delete();

create or replace function public.cancel_partner_removal(p_partnership uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update partnerships set removal_effective_at = null
   where id = p_partnership and owner_id = auth.uid() and removal_effective_at is not null;
  if not found then
    raise exception 'Nothing to cancel' using errcode = 'P0001';
  end if;
end $$;

-- ---------- Apply queued changes (cron, every 5 minutes) ----------
create or replace function public.apply_pending_changes()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('leash.applying', 'on', true);

  delete from limits
   where pending_effective_at <= now() and coalesce((pending_change ->> 'delete')::boolean, false);

  update limits set
    minutes            = coalesce((pending_change ->> 'minutes')::int, minutes),
    approvals_required = coalesce((pending_change ->> 'approvals_required')::int, approvals_required),
    strictness         = coalesce((pending_change ->> 'strictness')::strictness, strictness),
    active             = coalesce((pending_change ->> 'active')::boolean, active),
    kind               = coalesce((pending_change ->> 'kind')::limit_kind, kind),
    pending_change       = null,
    pending_effective_at = null
  where pending_effective_at <= now();

  delete from partnerships where removal_effective_at <= now();

  perform set_config('leash.applying', 'off', true);
end $$;

select cron.schedule('apply-pending-changes', '*/5 * * * *', $$ select public.apply_pending_changes(); $$);

-- ---------- Emergency unlock ----------
-- prepare_request() gets an emergency path: approved immediately, no partners needed.
create or replace function public.prepare_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lim        limits%rowtype;
  n_partners int;
begin
  new.created_at := now();

  if coalesce(current_setting('leash.emergency', true), '') = 'on' then
    if new.limit_id is not null
       and not exists (select 1 from limits where id = new.limit_id and user_id = new.requester_id) then
      raise exception 'Limit not found' using errcode = 'P0001';
    end if;
    new.emergency          := true;
    new.status             := 'approved';
    new.minutes_granted    := new.minutes_requested;
    new.approvals_required := 0;
    new.decided_at         := now();
    new.expires_at         := now();
    return new;
  end if;

  new.emergency       := false;
  new.status          := 'pending';
  new.minutes_granted := null;
  new.decided_at      := null;
  new.expires_at      := now() + interval '30 minutes';

  if exists (select 1 from extension_requests
             where requester_id = new.requester_id and status = 'pending' and expires_at > now()) then
    raise exception 'You already have a pending request' using errcode = 'P0001';
  end if;

  select count(*) into n_partners
    from partnerships where owner_id = new.requester_id and status = 'accepted';
  if n_partners = 0 then
    raise exception 'Add at least one accountability partner first' using errcode = 'P0001';
  end if;

  if new.limit_id is not null then
    select * into lim from limits where id = new.limit_id and user_id = new.requester_id;
    if not found then
      raise exception 'Limit not found' using errcode = 'P0001';
    end if;
    if lim.strictness = 'locked' then
      raise exception 'This limit is locked and cannot be extended' using errcode = 'P0001';
    end if;
    new.approvals_required := least(lim.approvals_required, n_partners);
    if lim.strictness = 'strict' then
      new.approvals_required := greatest(new.approvals_required, n_partners / 2 + 1);
      new.expires_at := now() + interval '15 minutes';
    end if;
  else
    new.approvals_required := 1;
  end if;

  return new;
end $$;

create or replace function public.emergency_unlock(p_minutes int, p_reason text, p_limit uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_minutes is null or p_minutes not between 1 and 15 then
    raise exception 'Emergency unlocks are limited to 15 minutes' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Say briefly why this is an emergency' using errcode = 'P0001';
  end if;
  if exists (select 1 from extension_requests
             where requester_id = auth.uid() and emergency and created_at > now() - interval '24 hours') then
    raise exception 'You already used an emergency unlock in the last 24 hours' using errcode = 'P0001';
  end if;

  perform set_config('leash.emergency', 'on', true);
  insert into extension_requests (requester_id, limit_id, minutes_requested, reason)
  values (auth.uid(), p_limit, p_minutes, left(trim(p_reason), 280))
  returning id into rid;
  perform set_config('leash.emergency', 'off', true);
  return rid;
end $$;

-- ---------- Heartbeat + tamper reporting ----------
-- Called by the app whenever it comes to the foreground.
create or replace function public.report_screen_time_status(p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  prev text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_status not in ('approved', 'denied', 'notDetermined') then
    -- e.g. 'unsupported' (simulator / web): just a heartbeat
    update profiles set last_seen_at = now() where id = auth.uid();
    return;
  end if;

  select screen_time_status into prev from profiles where id = auth.uid() for update;
  update profiles set last_seen_at = now(), screen_time_status = p_status where id = auth.uid();

  if prev = 'approved' and p_status <> 'approved' then
    insert into tamper_events (user_id, kind) values (auth.uid(), 'screen_time_revoked');
  elsif prev is not null and prev <> 'approved' and p_status = 'approved' then
    insert into tamper_events (user_id, kind) values (auth.uid(), 'screen_time_restored');
  end if;
end $$;

-- Clients must not write these profile fields directly.
create or replace function public.guard_profile_update()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.last_seen_at := old.last_seen_at;
    new.screen_time_status := old.screen_time_status;
  end if;
  return new;
end $$;

create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------- Notifications for the new events ----------
create trigger notify_tamper_event
  after insert on public.tamper_events
  for each row execute function public.notify_edge_function();

-- Fires when a loosening is newly scheduled (or its 24 h timer restarts).
create trigger notify_limit_loosening
  after update on public.limits
  for each row
  when (new.pending_effective_at is not null and new.pending_effective_at is distinct from old.pending_effective_at)
  execute function public.notify_edge_function();

create trigger notify_partner_removal
  after update on public.partnerships
  for each row
  when (new.removal_effective_at is not null and old.removal_effective_at is null)
  execute function public.notify_edge_function();

-- ---------- Privileges ----------
revoke execute on function public.apply_pending_changes()               from public, anon, authenticated;
revoke execute on function public.emergency_unlock(int, text, uuid)      from public, anon;
revoke execute on function public.report_screen_time_status(text)        from public, anon;
revoke execute on function public.cancel_partner_removal(uuid)           from public, anon;
grant  execute on function public.emergency_unlock(int, text, uuid)      to authenticated;
grant  execute on function public.report_screen_time_status(text)        to authenticated;
grant  execute on function public.cancel_partner_removal(uuid)           to authenticated;

alter publication supabase_realtime add table public.limits, public.tamper_events;
