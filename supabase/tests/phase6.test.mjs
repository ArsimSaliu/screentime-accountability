// Runs every migration against an in-memory Postgres (PGlite) with Supabase's auth/vault/pg_net/cron
// stubbed, then exercises the rules as real users. Run: npm run test:db
// Phase 6 tests on a fresh database (run after all migrations).
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const dir = process.argv[2] ?? new URL('../migrations', import.meta.url).pathname;
const db = new PGlite();
const base = fs.readFileSync(new URL('./core.test.mjs', import.meta.url), 'utf8');
const stubs = base.slice(base.indexOf('const stubs = `') + 15, base.indexOf('`;', base.indexOf('const stubs = `')));
await db.exec(stubs);
for (const f of fs.readdirSync(dir).sort()) {
  await db.exec(fs.readFileSync(`${dir}/${f}`, 'utf8').replace(/create extension[^;]*;/g, ''));
}
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;
  insert into vault.decrypted_secrets values ('project_url','https://x.supabase.co'),('notify_secret','s');`);
const A='a0000000-0000-4000-8000-000000000000', B='b0000000-0000-4000-8000-000000000000', C='c0000000-0000-4000-8000-000000000000';
await db.exec(`insert into auth.users (id,email) values ('${A}','a@x'),('${B}','b@x'),('${C}','c@x');
  update profiles set username = case id when '${A}' then 'alice' when '${B}' then 'bob' else 'carol' end, onboarded = true;`);
async function as(uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return await db.query(sql, params); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
async function expectErr(label, p, re) {
  try { await p; console.log('FAIL (no error):', label); process.exitCode = 1; }
  catch (e) { const ok = re.test(e.message); console.log(ok ? 'ok  ' : 'FAIL', label, '->', e.message); if (!ok) process.exitCode = 1; }
}
function check(label, cond) { console.log(cond ? 'ok  ' : 'FAIL', label); if (!cond) process.exitCode = 1; }
const calls = async (where) => (await db.query(`select count(*)::int n from net.calls where ${where}`)).rows[0].n;

// --- invite links
const code = (await as(A, `select create_invite_link() c`)).rows[0].c;
check('invite code created (16 chars)', typeof code === 'string' && code.length === 16);
check('same code reused', (await as(A, `select create_invite_link() c`)).rows[0].c === code);
const info = (await as('', `select invite_link_info($1) i`, [code])).rows[0].i;
check('anon can preview invite (username only)', info.username === 'alice' && info.expired === false);
await expectErr('anon cannot accept invite', as('', `select accept_invite_link($1)`, [code]), /permission denied/);
await expectErr('owner cannot accept own link', as(A, `select accept_invite_link($1)`, [code]), /own invite link/);
await as(B, `select accept_invite_link($1)`, [code]);
check('accepting link creates accepted partnership', (await db.query(`select status from partnerships where owner_id=$1 and partner_id=$2`, [A, B])).rows[0]?.status === 'accepted');
await as(C, `select invite_partner('alice')`); // C invites A (other direction) - unrelated
await as(A, `select invite_partner('carol')`);
await as(C, `select accept_invite_link($1)`, [code]);
check('link upgrades an existing pending invite', (await db.query(`select status from partnerships where owner_id=$1 and partner_id=$2`, [A, C])).rows[0].status === 'accepted');
await expectErr('bad code rejected', as(B, `select accept_invite_link('nope')`), /invalid or has expired/);
await db.query(`update invite_links set expires_at = now() - interval '1 minute'`);
await expectErr('expired code rejected', as(C, `select accept_invite_link($1)`, [code]), /invalid or has expired/);
check('uses counted', (await db.query(`select uses from invite_links`)).rows[0].uses === 2);

// --- counter-offers (A has partners B and C; approvals_required default 1 -> use limit with 2)
const L = (await as(A, `insert into limits (user_id,name,kind,minutes,approvals_required) values ($1,'Social','daily',60,2) returning id`, [A])).rows[0].id;
const R = (await as(A, `insert into extension_requests (requester_id, limit_id, minutes_requested) values ($1,$2,30) returning id`, [A, L])).rows[0].id;
await as(B, `insert into request_votes (request_id, voter_id, decision, minutes) values ($1,$2,'approve',500)`, [R, B]);
check('offer above request is clamped to request', (await db.query(`select minutes from request_votes where voter_id=$1`, [B])).rows[0].minutes === 30);
await as(C, `insert into request_votes (request_id, voter_id, decision, minutes) values ($1,$2,'approve',10)`, [R, C]);
const r = (await db.query(`select status, minutes_granted from extension_requests where id=$1`, [R])).rows[0];
check(`grants the smallest offer (got ${r.minutes_granted})`, r.status === 'approved' && r.minutes_granted === 10);
const R2 = (await as(A, `insert into extension_requests (requester_id, minutes_requested) values ($1,20) returning id`, [A])).rows[0].id;
await as(B, `insert into request_votes (request_id, voter_id, decision, minutes) values ($1,$2,'deny',5)`, [R2, B]);
check('deny votes carry no minutes', (await db.query(`select minutes from request_votes where request_id=$1`, [R2])).rows[0].minutes === null);

// --- nudges
const R3 = (await as(A, `select emergency_unlock(1,'x y z')`).then(() => null)) ;
await db.query(`update extension_requests set status='expired' where status='pending'`);
const R4 = (await as(A, `insert into extension_requests (requester_id, minutes_requested) values ($1,15) returning id`, [A])).rows[0].id;
await db.query(`update extension_requests set created_at = now() - interval '6 minutes' where id=$1`, [R4]);
const before = await calls(`body->>'type'='UPDATE' and body->>'table'='extension_requests'`);
const job = (await db.query(`select cmd from cron.jobs where name='remind-partners'`)).rows[0].cmd;
await db.exec(job);
check('reminder marks request', (await db.query(`select reminded_at from extension_requests where id=$1`, [R4])).rows[0].reminded_at !== null);
check('reminder notifies once', (await calls(`body->>'type'='UPDATE' and body->>'table'='extension_requests'`)) === before + 1);
await db.exec(job);
check('reminder not repeated', (await calls(`body->>'type'='UPDATE' and body->>'table'='extension_requests'`)) === before + 1);

// --- downtime limits
await expectErr('downtime needs a window', as(A, `insert into limits (user_id,name,kind,minutes) values ($1,'Bed','downtime',60)`, [A]), /downtime_window/);
const D = (await as(A, `insert into limits (user_id,name,kind,minutes,start_minute,end_minute) values ($1,'Bed','downtime',540,1320,420) returning id`, [A])).rows[0].id;
check('downtime limit created (22:00-07:00)', !!D);
await as(A, `update limits set start_minute = 1380 where id=$1`, [D]);
let d = (await db.query(`select * from limits where id=$1`, [D])).rows[0];
check('window change is queued for 24h', d.start_minute === 1320 && d.pending_change.start_minute === 1380 && d.pending_effective_at !== null);
await db.query(`update limits set pending_effective_at = now() - interval '1 minute' where id=$1`, [D]);
await db.exec(`select apply_pending_changes()`);
d = (await db.query(`select * from limits where id=$1`, [D])).rows[0];
check('queued window applied by cron', d.start_minute === 1380 && d.end_minute === 420 && d.pending_change === null);
const Dl = (await as(A, `insert into limits (user_id,name,kind,minutes) values ($1,'Games','daily',30) returning id`, [A])).rows[0].id;
await as(A, `update limits set kind='downtime', start_minute=1200, end_minute=360 where id=$1`, [Dl]);
const dl = (await db.query(`select * from limits where id=$1`, [Dl])).rows[0];
check('switching daily -> downtime is queued with its window', dl.kind === 'daily' && dl.pending_change.kind === 'downtime' && dl.pending_change.start_minute === 1200);
await db.query(`update limits set pending_effective_at = now() - interval '1 minute' where id=$1`, [Dl]);
await db.exec(`select apply_pending_changes()`);
check('kind switch applied', (await db.query(`select kind, start_minute from limits where id=$1`, [Dl])).rows[0].kind === 'downtime');

console.log(process.exitCode ? 'SOME PHASE 6 TESTS FAILED' : 'ALL PHASE 6 TESTS PASSED');
