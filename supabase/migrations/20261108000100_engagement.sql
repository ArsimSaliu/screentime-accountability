-- =====================================================================
-- Phase 6: invite links, counter-offers, nudges, downtime limits
-- =====================================================================

-- ---------- 1. Invite links ----------
create table public.invite_links (
  code       text primary key,
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  uses       int not null default 0
);
create index on public.invite_links (owner_id);
alter table public.invite_links enable row level security;
create policy "own invite links" on public.invite_links
  for select to authenticated using (owner_id = (select auth.uid()));

-- Returns the caller's current invite code (reusing one that's valid for at least another day).
create or replace function public.create_invite_link()
returns text language plpgsql security definer set search_path = public as $$
declare
  c text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select code into c from invite_links
   where owner_id = auth.uid() and expires_at > now() + interval '1 day'
   order by created_at desc limit 1;
  if c is null then
    c := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    insert into invite_links (code, owner_id) values (c, auth.uid());
  end if;
  return c;
end $$;

-- Public preview for the join page (works before sign-in): who is inviting?
create or replace function public.invite_link_info(p_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('username', p.username, 'display_name', p.display_name, 'expired', l.expires_at < now())
    from invite_links l join profiles p on p.id = l.owner_id
   where l.code = p_code;
$$;

-- The caller becomes the link owner's accepted partner.
create or replace function public.accept_invite_link(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  link invite_links%rowtype;
  pid  uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select * into link from invite_links where code = p_code;
  if not found or link.expires_at < now() then
    raise exception 'This invite link is invalid or has expired' using errcode = 'P0001';
  end if;
  if link.owner_id = auth.uid() then
    raise exception 'This is your own invite link. Share it with a friend.' using errcode = 'P0001';
  end if;

  insert into partnerships (owner_id, partner_id, status)
  values (link.owner_id, auth.uid(), 'accepted')
  on conflict (owner_id, partner_id) do update
    set status = 'accepted', removal_effective_at = null
  returning id into pid;

  update invite_links set uses = uses + 1 where code = p_code;
  return pid;
end $$;

-- ---------- 2. Counter-offers ----------
alter table public.request_votes
  add column minutes int check (minutes between 1 and 240);

-- Approvals may offer fewer minutes than requested; denials carry none.
create or replace function public.prepare_vote()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested int;
begin
  if new.decision = 'deny' then
    new.minutes := null;
  else
    select minutes_requested into requested from extension_requests where id = new.request_id;
    new.minutes := least(coalesce(new.minutes, requested), requested);
  end if;
  return new;
end $$;

create trigger before_vote_insert
  before insert on public.request_votes
  for each row execute function public.prepare_vote();

-- Same as before, but grants the smallest amount any approving partner offered.
create or replace function public.resolve_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  req         extension_requests%rowtype;
  n_approve   int;
  n_deny      int;
  n_partners  int;
  min_offered int;
begin
  select * into req from extension_requests where id = new.request_id for update;
  if req.status <> 'pending' then
    return new;
  end if;

  select count(*) filter (where decision = 'approve'),
         count(*) filter (where decision = 'deny'),
         min(minutes) filter (where decision = 'approve')
    into n_approve, n_deny, min_offered
    from request_votes where request_id = req.id;

  select count(*) into n_partners
    from partnerships where owner_id = req.requester_id and status = 'accepted';

  if n_approve >= req.approvals_required then
    update extension_requests
       set status = 'approved',
           minutes_granted = least(req.minutes_requested, coalesce(min_offered, req.minutes_requested)),
           decided_at = now()
     where id = req.id;
  elsif n_partners - n_deny < req.approvals_required then
    update extension_requests set status = 'denied', decided_at = now() where id = req.id;
  end if;
  return new;
end $$;

-- ---------- 3. Nudges ----------
alter table public.extension_requests add column reminded_at timestamptz;

create trigger notify_request_reminder
  after update on public.extension_requests
  for each row
  when (old.reminded_at is null and new.reminded_at is not null and new.status = 'pending')
  execute function public.notify_edge_function();

select cron.schedule(
  'remind-partners',
  '* * * * *',
  $$
    update public.extension_requests
       set reminded_at = now()
     where status = 'pending'
       and reminded_at is null
       and created_at < now() - interval '5 minutes'
       and expires_at > now() + interval '2 minutes';
  $$
);

-- ---------- 4. Downtime limits ----------
alter table public.limits
  add column start_minute int check (start_minute between 0 and 1439),
  add column end_minute   int check (end_minute between 0 and 1439),
  add constraint downtime_window check (
    kind <> 'downtime' or (start_minute is not null and end_minute is not null and start_minute <> end_minute)
  );

-- Extend the "tighten now, loosen later" guard: any kind change (except session -> daily)
-- and any change to a downtime window is treated as loosening.
create or replace function public.guard_limit_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pend     jsonb;
  loosened boolean := false;
begin
  if leash_applying() or auth.uid() is null then
    return new;
  end if;

  if new.pending_change is null and old.pending_change is not null then
    pend := '{}'::jsonb;
  elsif new.pending_change is distinct from old.pending_change
     or new.pending_effective_at is distinct from old.pending_effective_at then
    raise exception 'Scheduled changes are managed by the server' using errcode = 'P0001';
  else
    pend := coalesce(old.pending_change, '{}'::jsonb);
  end if;

  if old.strictness = 'relaxed' then
    new.pending_change := null;
    new.pending_effective_at := null;
    return new;
  end if;

  if new.minutes > old.minutes and old.kind <> 'downtime' then
    pend := pend || jsonb_build_object('minutes', new.minutes); new.minutes := old.minutes; loosened := true;
  elsif new.minutes < old.minutes or old.kind = 'downtime' then
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

  if new.kind <> old.kind then
    if old.kind = 'session' and new.kind = 'daily' then
      pend := pend - 'kind';
    else
      pend := pend || jsonb_build_object('kind', new.kind); new.kind := old.kind; loosened := true;
    end if;
  end if;

  if new.start_minute is distinct from old.start_minute or new.end_minute is distinct from old.end_minute then
    pend := pend || jsonb_build_object('start_minute', new.start_minute, 'end_minute', new.end_minute);
    new.start_minute := old.start_minute; new.end_minute := old.end_minute; loosened := true;
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
    start_minute       = case when pending_change ? 'start_minute' then (pending_change ->> 'start_minute')::int else start_minute end,
    end_minute         = case when pending_change ? 'end_minute' then (pending_change ->> 'end_minute')::int else end_minute end,
    pending_change       = null,
    pending_effective_at = null
  where pending_effective_at <= now();

  delete from partnerships where removal_effective_at <= now();

  perform set_config('leash.applying', 'off', true);
end $$;

-- ---------- Privileges ----------
revoke execute on function public.create_invite_link()      from public, anon;
revoke execute on function public.accept_invite_link(text)  from public, anon;
revoke execute on function public.invite_link_info(text)    from public;
grant  execute on function public.create_invite_link()      to authenticated;
grant  execute on function public.accept_invite_link(text)  to authenticated;
grant  execute on function public.invite_link_info(text)    to anon, authenticated;
