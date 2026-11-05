-- Weekly digest: Sundays 17:43 UTC → `weekly-digest` edge function
-- (same Vault secrets / shared secret as the `notify` function).
select cron.schedule(
  'weekly-digest',
  '43 17 * * 0',
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/weekly-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-notify-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret')
      ),
      body    := '{}'::jsonb
    );
  $$
);
