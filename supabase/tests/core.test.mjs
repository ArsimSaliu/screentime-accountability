// Runs every migration against an in-memory Postgres (PGlite) with Supabase's auth/vault/pg_net/cron
// stubbed, then exercises the rules as real users. Run: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const dir = process.argv[2] ?? new URL('../migrations', import.meta.url).pathname;
const db = new PGlite();

const stubs = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create publication supabase_realtime;
create schema vault; create table vault.decrypted_secrets (name text, decrypted_secret text);
create schema net; create table net.calls (url text, body jsonb);
create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language plpgsql as $$
begin insert into net.calls values (url, body); return 1; end $$;
create schema cron; create table cron.jobs (name text, schedule text, cmd text);
create function cron.schedule(n text, s text, c text) returns bigint language plpgsql as $$
begin insert into cron.jobs values (n, s, c); return 1; end $$;
grant usage on schema public, auth to anon, authenticated;
`;
await db.exec(stubs);
for (const f of fs.readdirSync(dir).sort()) {
  let sql = fs.readFileSync(`${dir}/${f}`, 'utf8').replace(/create extension[^;]*;/g, '');
  await db.exec(sql);
  console.log('applied', f);
}
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;
  insert into vault.decrypted_secrets values ('project_url','https://x.supabase.co'),('notify_secret','s');`);

const A='a0000000-0000-4000-8000-000000000000', B='b0000000-0000-4000-8000-000000000000', C='c0000000-0000-4000-8000-000000000000';
await db.exec(`insert into auth.users (id,email) values ('${A}','a@x'),('${B}','b@x'),('${C}','c@x');
  update profiles set username = case id when '${A}' then 'alice' when '${B}' then 'bob' else 'carol' end, onboarded = true;`);

async function as(uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
async function expectErr(label, p, re) {
  try { await p; console.log('FAIL (no error):', label); process.exitCode = 1; }
  catch (e) { const ok = re.test(e.message); console.log(ok ? 'ok  ' : 'FAIL', label, '->', e.message); if (!ok) process.exitCode = 1; }
}
function check(label, cond) { console.log(cond ? 'ok  ' : 'FAIL', label); if (!cond) process.exitCode = 1; }

// Request without partners fails
await expectErr('request with no partners', as(A, `insert into extension_requests (requester_id, minutes_requested) values ($1, 15)`, [A]), /at least one/);

// Invites
await as(A, `select invite_partner('bob')`);
await as(A, `select invite_partner('carol')`);
await expectErr('invite self', as(A, `select invite_partner('alice')`), /own partner/);
await expectErr('duplicate invite', as(A, `select invite_partner('bob')`), /Already invited/);
const pBob = (await as(B, `select id from partnerships where partner_id = $1`, [B])).rows[0].id;
await expectErr('owner cannot accept own invite', as(A, `select accept_invite($1)`, [pBob]), /not found/);
await as(B, `select accept_invite($1)`, [pBob]);
const upd = await as(B, `update partnerships set owner_id = $1 where id = $2`, [C, pBob]);
check('partner cannot rewrite partnership via UPDATE (0 rows)', upd.affectedRows === 0);
check('invite_partner triggered notify (pg_net)', (await db.query(`select count(*)::int n from net.calls`)).rows[0].n >= 3);

// Limit + request
const lim = (await as(A, `insert into limits (user_id, name, kind, minutes, approvals_required) values ($1,'Social','daily',60,3) returning id`, [A])).rows[0].id;
await expectErr('C cannot see A limits (not accepted) -> insert into other user limit', as(C, `insert into limits (user_id, name, kind, minutes) values ($1,'x','daily',5)`, [A]), /row-level security/);
const r1 = (await as(A, `insert into extension_requests (requester_id, limit_id, minutes_requested, status, approvals_required) values ($1,$2,20,'approved',0) returning *`, [A, lim])).rows[0];
check('client cannot force status (forced pending)', r1.status === 'pending');
check('approvals_required capped to partner count (1)', r1.approvals_required === 1);
await expectErr('second pending request blocked', as(A, `insert into extension_requests (requester_id, minutes_requested) values ($1, 5)`, [A]), /already have a pending/);
await expectErr('requester cannot vote on own request', as(A, `insert into request_votes (request_id, voter_id, decision) values ($1,$2,'approve')`, [r1.id, A]), /row-level security/);
await expectErr('non-partner cannot vote', as(C, `insert into request_votes (request_id, voter_id, decision) values ($1,$2,'approve')`, [r1.id, C]), /row-level security/);
check('non-partner cannot read request', (await as(C, `select * from extension_requests`)).rows.length === 0);
check('partner can read request', (await as(B, `select * from extension_requests`)).rows.length === 1);
const u2 = await as(A, `update extension_requests set status='approved' where id=$1`, [r1.id]);
check('requester cannot UPDATE status directly', u2.affectedRows === 0);
await as(B, `insert into request_votes (request_id, voter_id, decision) values ($1,$2,'approve')`, [r1.id, B]);
let row = (await db.query(`select status, minutes_granted from extension_requests where id=$1`, [r1.id])).rows[0];
check('vote resolves to approved w/ minutes_granted=20', row.status === 'approved' && row.minutes_granted === 20);
check('resolution triggered notify', (await db.query(`select count(*)::int n from net.calls where body->>'table'='extension_requests' and body->>'type'='UPDATE'`)).rows[0].n === 1);

// Deny path + cancel + expiry
const r2 = (await as(A, `insert into extension_requests (requester_id, minutes_requested) values ($1, 10) returning id`, [A])).rows[0].id;
await as(B, `insert into request_votes (request_id, voter_id, decision) values ($1,$2,'deny')`, [r2, B]);
row = (await db.query(`select status from extension_requests where id=$1`, [r2])).rows[0];
check('deny from only partner -> denied', row.status === 'denied');
const r3 = (await as(A, `insert into extension_requests (requester_id, minutes_requested) values ($1, 10) returning id`, [A])).rows[0].id;
await expectErr('partner cannot cancel', as(B, `select cancel_request($1)`, [r3]), /not found/);
await as(A, `select cancel_request($1)`, [r3]);
check('requester cancels', (await db.query(`select status from extension_requests where id=$1`, [r3])).rows[0].status === 'cancelled');
const r4 = (await as(A, `insert into extension_requests (requester_id, minutes_requested) values ($1, 10) returning id`, [A])).rows[0].id;
await db.query(`update extension_requests set expires_at = now() - interval '1 minute' where id=$1`, [r4]);
await expectErr('cannot vote on expired', as(B, `insert into request_votes (request_id, voter_id, decision) values ($1,$2,'approve')`, [r4, B]), /row-level security/);
const job = (await db.query(`select cmd from cron.jobs where name='expire-extension-requests'`)).rows[0].cmd;
await db.exec(job);
check('cron job expires request', (await db.query(`select status from extension_requests where id=$1`, [r4])).rows[0].status === 'expired');

// Locked limit
const locked = (await as(A, `insert into limits (user_id, name, kind, minutes, strictness) values ($1,'Bed','daily',1,'locked') returning id`, [A])).rows[0].id;
await expectErr('locked limit blocks requests', as(A, `insert into extension_requests (requester_id, limit_id, minutes_requested) values ($1,$2,5)`, [A, locked]), /locked/);

// anon cannot call RPCs
await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
await expectErr('anon cannot call invite_partner', db.query(`select invite_partner('bob')`), /permission denied/);
await db.exec('reset role');

// Push token moves between users
await as(A, `select register_push_token('ExponentPushToken[1]','ios')`);
await as(B, `select register_push_token('ExponentPushToken[1]','ios')`);
check('push token re-assigned to latest user', (await db.query(`select user_id from push_tokens`)).rows[0].user_id === B);

// ================= Phase 4 =================
console.log('--- phase 4');
const L = (await as(A, `insert into limits (user_id, name, kind, minutes, strictness) values ($1,'Games','daily',30,'standard') returning id`, [A])).rows[0].id;
const getL = async () => (await db.query(`select * from limits where id=$1`, [L])).rows[0];

await as(A, `update limits set minutes = 20 where id=$1`, [L]);
let l = await getL();
check('tightening applies immediately', l.minutes === 20 && l.pending_change === null);

await as(A, `update limits set minutes = 90, name = 'Gaming' where id=$1`, [L]);
l = await getL();
check('loosening queued, current kept, name applied', l.minutes === 20 && l.pending_change.minutes === 90 && l.name === 'Gaming' && l.pending_effective_at !== null);
check('loosening notifies partners', (await db.query(`select count(*)::int n from net.calls where body->>'table'='limits'`)).rows[0].n === 1);

await as(A, `update limits set strictness='relaxed', active=false where id=$1`, [L]);
l = await getL();
check('strictness + pause queued too', l.strictness === 'standard' && l.active === true && l.pending_change.strictness === 'relaxed' && l.pending_change.active === false);

await as(A, `update limits set minutes = 10 where id=$1`, [L]);
l = await getL();
check('tightening a field drops its queued loosening', l.minutes === 10 && !('minutes' in l.pending_change) && l.pending_change.active === false);

await expectErr('client cannot forge pending_change', as(A, `update limits set pending_change='{"minutes":999}', pending_effective_at=now() where id=$1`, [L]), /managed by the server/);

await as(A, `update limits set pending_change = null where id=$1`, [L]);
l = await getL();
check('owner can cancel scheduled change', l.pending_change === null && l.pending_effective_at === null);

await as(A, `delete from limits where id=$1`, [L]);
l = await getL();
check('delete of active strict limit is scheduled, not immediate', !!l && l.pending_change.delete === true);

await db.query(`update limits set pending_effective_at = now() - interval '1 minute' where id=$1`, [L]);
await db.exec(`select public.apply_pending_changes()`);
check('cron applies scheduled delete', !(await getL()));

const R = (await as(A, `insert into limits (user_id, name, kind, minutes, strictness) values ($1,'Chill','daily',30,'relaxed') returning id`, [A])).rows[0].id;
await as(A, `update limits set minutes = 300 where id=$1`, [R]);
check('relaxed limit loosens immediately', (await db.query(`select minutes from limits where id=$1`, [R])).rows[0].minutes === 300);
await as(A, `delete from limits where id=$1`, [R]);
check('relaxed limit deletes immediately', (await db.query(`select 1 from limits where id=$1`, [R])).rows.length === 0);

const P = (await as(A, `insert into limits (user_id, name, kind, minutes) values ($1,'Apply','daily',30) returning id`, [A])).rows[0].id;
await as(A, `update limits set minutes = 45, approvals_required = 1, kind='session' where id=$1`, [P]);
await db.query(`update limits set pending_effective_at = now() - interval '1 minute' where id=$1`, [P]);
await db.exec(`select public.apply_pending_changes()`);
const pl = (await db.query(`select * from limits where id=$1`, [P])).rows[0];
check('cron applies queued field changes', pl.minutes === 45 && pl.kind === 'session' && pl.pending_change === null);

await expectErr('authenticated cannot call apply_pending_changes', as(A, `select apply_pending_changes()`), /permission denied/);

// Partner removal
await as(A, `delete from partnerships where id=$1`, [pBob]);
let pb = (await db.query(`select * from partnerships where id=$1`, [pBob])).rows[0];
check('owner removing accepted partner is scheduled', !!pb && pb.removal_effective_at !== null);
check('partner removal notifies', (await db.query(`select count(*)::int n from net.calls where body->>'table'='partnerships' and body->>'type'='UPDATE'`)).rows[0].n >= 1);
await as(A, `select cancel_partner_removal($1)`, [pBob]);
pb = (await db.query(`select * from partnerships where id=$1`, [pBob])).rows[0];
check('owner can cancel partner removal', pb.removal_effective_at === null);
const pCarol = (await db.query(`select id from partnerships where partner_id=$1`, [C])).rows[0].id;
await as(A, `delete from partnerships where id=$1`, [pCarol]);
check('withdrawing a pending invite is immediate', (await db.query(`select 1 from partnerships where id=$1`, [pCarol])).rows.length === 0);

// Emergency unlock
await expectErr('emergency > 15 min refused', as(A, `select emergency_unlock(30, 'need it')`), /15 minutes/);
await expectErr('emergency needs a reason', as(A, `select emergency_unlock(10, '')`), /why/);
const E = (await as(A, `select emergency_unlock(10, 'Need maps to get home')`)).rows[0].emergency_unlock;
const er = (await db.query(`select * from extension_requests where id=$1`, [E])).rows[0];
check('emergency approved immediately', er.status === 'approved' && er.minutes_granted === 10 && er.emergency === true);
await expectErr('emergency once per 24h', as(A, `select emergency_unlock(5, 'again please')`), /last 24 hours/);
const forged = (await as(B, `insert into extension_requests (requester_id, minutes_requested, emergency, status) values ($1, 5, true, 'approved') returning *`, [B]).catch(e => ({ rows: [{ err: e.message }] }))).rows[0];
check('client cannot forge emergency flag', forged.err ? /partner/.test(forged.err) : (forged.emergency === false && forged.status === 'pending'));

// Tamper / heartbeat
await as(A, `select report_screen_time_status('approved')`);
check('heartbeat stored', (await db.query(`select last_seen_at is not null ok, screen_time_status s from profiles where id=$1`, [A])).rows[0].s === 'approved');
await as(A, `select report_screen_time_status('denied')`);
check('revocation creates tamper event', (await db.query(`select kind from tamper_events where user_id=$1`, [A])).rows.map(r => r.kind).join() === 'screen_time_revoked');
check('partner can see tamper event', (await as(B, `select * from tamper_events`)).rows.length === 1);
check('non-partner cannot see tamper event', (await as(C, `select * from tamper_events`)).rows.length === 0);
await as(A, `select report_screen_time_status('approved')`);
check('restoring creates restored event', (await db.query(`select count(*)::int n from tamper_events where kind='screen_time_restored'`)).rows[0].n === 1);
await as(A, `update profiles set screen_time_status = 'approved', last_seen_at = '2000-01-01' where id=$1`, [A]);
check('client cannot write heartbeat fields directly', (await db.query(`select extract(year from last_seen_at)::int y from profiles where id=$1`, [A])).rows[0].y !== 2000);

// Account deletion cascades through the guards
await db.exec(`delete from auth.users where id = '${A}'`);
check('deleting a user cascades limits/partnerships despite guards', (await db.query(`select count(*)::int n from limits where user_id=$1`, [A])).rows[0].n === 0 && (await db.query(`select count(*)::int n from partnerships where owner_id=$1`, [A])).rows[0].n === 0);


// ================= Phase 5: stats =================
console.log('--- phase 5');
await db.exec(`update profiles set created_at = now() - interval '10 days', timezone = 'Europe/Berlin' where id = '${B}'`);
let st = (await as(B, `select user_stats($1) s`, [B])).rows[0].s;
check('no extensions: streak = days since signup incl. today (11)', st.streak_days === 11 && st.best_streak_days === 11);
for (const daysAgo of [6, 3]) {
  await db.exec(`select set_config('leash.emergency', 'on', false)`);
  const id = (await db.query(`insert into extension_requests (requester_id, minutes_requested) values ($1, 10) returning id`, [B])).rows[0].id;
  await db.exec(`select set_config('leash.emergency', 'off', false)`);
  await db.query(`update extension_requests set status='approved', emergency=false, minutes_granted=10, decided_at = now() - ($2 || ' days')::interval, created_at = now() - ($2 || ' days')::interval where id=$1`, [id, daysAgo]);
}
st = (await as(B, `select user_stats($1) s`, [B])).rows[0].s;
check(`streak = 3 days since last extension (got ${st.streak_days})`, st.streak_days === 3);
check(`best streak = 4 (got ${st.best_streak_days})`, st.best_streak_days === 4);
check(`week counts 2 approved / 20 min (got ${JSON.stringify(st.week)})`, st.week.approved === 2 && st.week.minutes_granted === 20);
await expectErr('non-partner cannot read stats', as(C, `select user_stats($1)`, [B]), /Not allowed/);
await db.exec(`update profiles set timezone = 'Not/AZone' where id = '${B}'`);
st = (await as(B, `select user_stats($1) s`, [B])).rows[0].s;
check('invalid timezone falls back to UTC', typeof st.streak_days === 'number');

console.log(process.exitCode ? 'SOME TESTS FAILED' : 'ALL SQL TESTS PASSED');
