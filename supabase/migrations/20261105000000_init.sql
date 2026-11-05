-- =====================================================================
-- Core schema: profiles, partnerships, limits, extension requests, votes
-- =====================================================================

-- ---------- Types ----------
create type public.limit_kind     as enum ('daily', 'session');
create type public.strictness     as enum ('relaxed', 'standard', 'strict', 'locked');
create type public.request_status as enum ('pending', 'approved', 'denied', 'expired', 'cancelled');

-- ---------- Tables ----------
create table public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  username     text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text check (char_length(display_name) <= 50),
  timezone     text not null default 'UTC',
  onboarded    boolean not null default false,
  created_at   timestamptz not null default now()
);

-- owner   = the person being held accountable
-- partner = the friend who approves/denies their requests
create table public.partnerships (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  partner_id uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (owner_id, partner_id),
  check (owner_id <> partner_id)
);
create index on public.partnerships (partner_id);

create table public.limits (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 50),
  kind               public.limit_kind not null,
  minutes            int  not null check (minutes between 1 and 1440),
  strictness         public.strictness not null default 'standard',
  approvals_required int  not null default 1 check (approvals_required between 1 and 10),
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);
create index on public.limits (user_id);

create table public.extension_requests (
  id                 uuid primary key default gen_random_uuid(),
  requester_id       uuid not null references public.profiles(id) on delete cascade,
  limit_id           uuid references public.limits(id) on delete set null,
  minutes_requested  int  not null check (minutes_requested between 1 and 240),
  reason             text check (char_length(reason) <= 280),
  status             public.request_status not null default 'pending',
  minutes_granted    int,
  approvals_required int  not null default 1,
  expires_at         timestamptz not null default now() + interval '30 minutes',
  decided_at         timestamptz,
  created_at         timestamptz not null default now()
);
create index on public.extension_requests (requester_id, created_at desc);
create index on public.extension_requests (status) where status = 'pending';

create table public.request_votes (
  request_id uuid not null references public.extension_requests(id) on delete cascade,
  voter_id   uuid not null references public.profiles(id) on delete cascade,
  decision   text not null check (decision in ('approve', 'deny')),
  comment    text check (char_length(comment) <= 280),
  created_at timestamptz not null default now(),
  primary key (request_id, voter_id)
);

create table public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  token      text not null unique,
  platform   text not null check (platform in ('ios', 'web')),
  created_at timestamptz not null default now()
);
create index on public.push_tokens (user_id);

-- ---------- Helper functions (security definer avoids RLS recursion) ----------
create or replace function public.is_accepted_partner(p_owner uuid, p_partner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from partnerships
    where owner_id = p_owner and partner_id = p_partner and status = 'accepted'
  );
$$;

create or replace function public.can_vote(p_request uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from extension_requests r
    where r.id = p_request
      and r.status = 'pending'
      and r.expires_at > now()
      and is_accepted_partner(r.requester_id, auth.uid())
  );
$$;

-- ---------- Triggers ----------

-- Create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username, display_name)
  values (
    new.id,
    'user_' || substr(replace(new.id::text, '-', ''), 1, 12),
    nullif(new.raw_user_meta_data ->> 'display_name', '')
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Server decides status / approvals / expiry. Never trust the client.
create or replace function public.prepare_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lim       limits%rowtype;
  n_partners int;
begin
  new.status          := 'pending';
  new.minutes_granted := null;
  new.decided_at      := null;
  new.created_at      := now();
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

create trigger before_request_insert
  before insert on public.extension_requests
  for each row execute function public.prepare_request();

-- Resolve the request after every vote.
create or replace function public.resolve_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  req        extension_requests%rowtype;
  n_approve  int;
  n_deny     int;
  n_partners int;
begin
  select * into req from extension_requests where id = new.request_id for update;
  if req.status <> 'pending' then
    return new;
  end if;

  select count(*) filter (where decision = 'approve'),
         count(*) filter (where decision = 'deny')
    into n_approve, n_deny
    from request_votes where request_id = req.id;

  select count(*) into n_partners
    from partnerships where owner_id = req.requester_id and status = 'accepted';

  if n_approve >= req.approvals_required then
    update extension_requests
       set status = 'approved', minutes_granted = req.minutes_requested, decided_at = now()
     where id = req.id;
  elsif n_partners - n_deny < req.approvals_required then
    update extension_requests
       set status = 'denied', decided_at = now()
     where id = req.id;
  end if;

  return new;
end $$;

create trigger after_vote_insert
  after insert on public.request_votes
  for each row execute function public.resolve_request();

-- ---------- RPCs ----------

-- Register an Expo/web push token for the current user (moves it if the
-- device was previously signed in as someone else).
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  insert into push_tokens (user_id, token, platform)
  values (auth.uid(), p_token, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform;
end $$;

-- Requester cancels their own pending request.
create or replace function public.cancel_request(p_request uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update extension_requests
     set status = 'cancelled', decided_at = now()
   where id = p_request and requester_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Request not found or no longer pending';
  end if;
end $$;

-- Invite someone (by username) to be your accountability partner.
create or replace function public.invite_partner(p_username text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  select id into target from profiles where username = lower(trim(p_username));
  if target is null then
    raise exception 'No user with that username' using errcode = 'P0001';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot be your own partner' using errcode = 'P0001';
  end if;
  insert into partnerships (owner_id, partner_id) values (auth.uid(), target)
  on conflict (owner_id, partner_id) do nothing
  returning id into new_id;
  if new_id is null then
    raise exception 'Already invited' using errcode = 'P0001';
  end if;
  return new_id;
end $$;

-- Invited partner accepts an invite addressed to them.
create or replace function public.accept_invite(p_partnership uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update partnerships set status = 'accepted'
   where id = p_partnership and partner_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'Invite not found' using errcode = 'P0001';
  end if;
end $$;

-- ---------- Row Level Security ----------
alter table public.profiles           enable row level security;
alter table public.partnerships       enable row level security;
alter table public.limits             enable row level security;
alter table public.extension_requests enable row level security;
alter table public.request_votes      enable row level security;
alter table public.push_tokens        enable row level security;

-- profiles: signed-in users can look each other up; edit only your own
create policy "profiles readable" on public.profiles
  for select to authenticated using (true);
create policy "profiles update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- partnerships: invites go through invite_partner(), accepting through
-- accept_invite(); either side can remove. No direct INSERT/UPDATE.
create policy "see own partnerships" on public.partnerships
  for select to authenticated using ((select auth.uid()) in (owner_id, partner_id));
create policy "either side removes" on public.partnerships
  for delete to authenticated using ((select auth.uid()) in (owner_id, partner_id));

-- limits: owner manages; accepted partners can view
create policy "owner manages limits" on public.limits
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "partners view limits" on public.limits
  for select to authenticated using (public.is_accepted_partner(user_id, (select auth.uid())));

-- extension_requests: requester creates and reads; partners read. Status changes
-- only happen via triggers / RPCs / cron, so there is no UPDATE policy.
create policy "requester creates" on public.extension_requests
  for insert to authenticated with check (requester_id = (select auth.uid()));
create policy "requester reads" on public.extension_requests
  for select to authenticated using (requester_id = (select auth.uid()));
create policy "partners read" on public.extension_requests
  for select to authenticated using (public.is_accepted_partner(requester_id, (select auth.uid())));

-- votes: accepted partners vote once on pending requests
create policy "partners vote" on public.request_votes
  for insert to authenticated
  with check (voter_id = (select auth.uid()) and public.can_vote(request_id));
create policy "votes visible" on public.request_votes
  for select to authenticated using (
    exists (
      select 1 from public.extension_requests r
      where r.id = request_id
        and (r.requester_id = (select auth.uid())
             or public.is_accepted_partner(r.requester_id, (select auth.uid())))
    )
  );

-- push tokens: own only (registration goes through register_push_token)
create policy "own push tokens" on public.push_tokens
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.extension_requests, public.request_votes, public.partnerships;

-- ---------- Function privileges ----------
-- Only signed-in users may call the RPCs/helpers (Postgres grants EXECUTE to PUBLIC by default).
revoke execute on function public.is_accepted_partner(uuid, uuid) from public, anon;
revoke execute on function public.can_vote(uuid)                  from public, anon;
revoke execute on function public.register_push_token(text, text) from public, anon;
revoke execute on function public.cancel_request(uuid)            from public, anon;
revoke execute on function public.invite_partner(text)            from public, anon;
revoke execute on function public.accept_invite(uuid)             from public, anon;
grant  execute on function public.is_accepted_partner(uuid, uuid) to authenticated;
grant  execute on function public.can_vote(uuid)                  to authenticated;
grant  execute on function public.register_push_token(text, text) to authenticated;
grant  execute on function public.cancel_request(uuid)            to authenticated;
grant  execute on function public.invite_partner(text)            to authenticated;
grant  execute on function public.accept_invite(uuid)             to authenticated;
