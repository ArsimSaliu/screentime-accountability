-- =====================================================================
-- Notifications, magic-link voting and request expiry
--
-- Requires two Vault secrets (see README "Supabase setup"):
--   project_url    e.g. https://abcd1234.supabase.co
--   notify_secret  random string, same value as the NOTIFY_SECRET edge-function secret
-- =====================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------- Magic-link vote tokens (service-role only: RLS on, no policies) ----------
create table public.vote_tokens (
  token_hash text primary key,              -- sha256(hex) of the token in the link
  request_id uuid not null references public.extension_requests(id) on delete cascade,
  voter_id   uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
alter table public.vote_tokens enable row level security;

-- ---------- Forward row changes to the `notify` edge function ----------
create or replace function public.notify_edge_function()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_url text;
  secret   text;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into secret   from vault.decrypted_secrets where name = 'notify_secret';
  if base_url is null or secret is null then
    raise warning 'notify_edge_function: vault secrets project_url / notify_secret missing, skipping';
    return new;
  end if;

  perform net.http_post(
    url     := base_url || '/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', secret
    ),
    body    := jsonb_build_object(
      'type',       tg_op,
      'table',      tg_table_name,
      'record',     to_jsonb(new),
      'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) end
    )
  );
  return new;
end $$;

revoke execute on function public.notify_edge_function() from public, anon, authenticated;

-- New request -> notify partners
create trigger notify_request_created
  after insert on public.extension_requests
  for each row execute function public.notify_edge_function();

-- Request resolved (approved/denied/expired/cancelled) -> notify requester
create trigger notify_request_resolved
  after update of status on public.extension_requests
  for each row when (old.status = 'pending' and new.status <> 'pending')
  execute function public.notify_edge_function();

-- Partner invite sent / accepted
create trigger notify_partnership_created
  after insert on public.partnerships
  for each row execute function public.notify_edge_function();

create trigger notify_partnership_accepted
  after update of status on public.partnerships
  for each row when (old.status = 'pending' and new.status = 'accepted')
  execute function public.notify_edge_function();

-- ---------- Expire stale requests every minute ----------
select cron.schedule(
  'expire-extension-requests',
  '* * * * *',
  $$
    update public.extension_requests
       set status = 'expired', decided_at = now()
     where status = 'pending' and expires_at < now();
  $$
);

-- Housekeeping: drop old magic-link tokens daily
select cron.schedule(
  'purge-vote-tokens',
  '17 3 * * *',
  $$ delete from public.vote_tokens where expires_at < now() - interval '1 day'; $$
);
