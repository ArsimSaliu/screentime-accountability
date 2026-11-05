# Leash: screen time with accountability partners

Set your own iOS screen time limits. When you hit one and really need more time,
your friends approve or deny the extension remotely, from the iOS app or the web.

```
apps/
  mobile/     Expo (SDK 58) + Expo Router: iOS app, built in the cloud with EAS
  web/        Next.js 16: dashboard + approve/deny for friends without the app
packages/
  shared/     DB types, zod schemas, formatting shared by both apps
supabase/
  migrations/ Postgres schema, RLS, triggers, cron
  functions/  Edge functions: notify (push/email), magic-vote (one-tap email links)
```

## Status

| Phase | What | State |
|---|---|---|
| 1 | Monorepo, Supabase schema + auth, mobile + web sign-in | ✅ done |
| 2 | Partners, requests, push notifications, approve/deny on app, web and email link, realtime | ✅ done |
| 3 | Real Screen Time blocking (FamilyControls / DeviceActivity / ManagedSettings) | ✅ code done, needs Apple entitlement to run on a device |
| 4 | Hardening: loosening takes 24 h, partner-removal cooldown, emergency unlock, tamper alerts | ✅ done |
| 5 | Streaks & stats, weekly digest, account deletion, privacy policy, TestFlight setup | ✅ done |
| 6 | Home-screen widget, Live Activity for "waiting for approval", Apple Watch approvals | ideas |

Without Screen Time access (Expo Go, simulator, or before Apple approves the entitlement), the app's
**"Request more time"** button still works, so you can test the whole approval loop end to end.

---

## How it works

1. You create a request (`extension_requests` insert). A Postgres trigger fixes the
   server-controlled fields (status, approvals needed, expiry) and refuses requests for
   `locked` limits or when you have no partners.
2. A trigger calls the **`notify`** edge function through `pg_net`. Partners with the app get a push
   with **Approve / Deny** buttons. Partners without it get an email with a single-use
   `/v/<token>` link.
3. A partner votes (`request_votes` insert, protected by RLS). The `resolve_request` trigger
   marks the request **approved** or **denied** once the outcome is certain.
4. The requester's screen updates live (Supabase Realtime) and they also get a push.
   The app lifts the shield and re-blocks after the granted minutes of use.
5. `pg_cron` expires unanswered requests every minute.

Security is enforced in the database, not the apps: clients cannot set a request's status,
vote on their own request, vote twice, vote after expiry, or edit someone else's partnership.

---

## Setup (Windows)

### 0. Prerequisites

- Node.js 22 LTS, Git (`git config --system core.longpaths true` in an admin shell)
- Accounts: [Supabase](https://supabase.com), [Expo](https://expo.dev), [Vercel](https://vercel.com),
  [Apple Developer Program](https://developer.apple.com/programs/) ($99/yr)
- **Request the Family Controls (Distribution) entitlement now.** Approval takes time, and you need it for
  **all four** bundle IDs: `com.yourname.leash`, `com.yourname.leash.ActivityMonitorExtension`,
  `com.yourname.leash.ShieldAction`, `com.yourname.leash.ShieldConfiguration`:
  https://developer.apple.com/contact/request/family-controls-distribution
  Once approved, enable "Family Controls (Distribution)" for each identifier at
  developer.apple.com → Identifiers. EAS handles provisioning after that.
- Optional: [Resend](https://resend.com) for the email approval links

```bash
git clone https://github.com/<you>/screentime-accountability.git
```

```bash
cd screentime-accountability
```

```bash
npm install
```

### 1. Supabase

Create a project in the Supabase dashboard, then from the repo root:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

```bash
npx supabase db push
```

**Vault secrets** (Dashboard → SQL Editor). The database uses these to call the `notify` function.
Pick a long random string for `notify_secret`:

```sql
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
select vault.create_secret('PASTE-A-LONG-RANDOM-STRING', 'notify_secret');
```

**Email OTP code:** go to Dashboard → Authentication → Emails and edit both the **Confirm signup**
(first sign-in) and **Magic Link** (later sign-ins) templates so the body contains `{{ .Token }}`
(for example `Your code is {{ .Token }}`). Both apps sign in with that code.
The built-in mailer is heavily rate-limited, so configure custom SMTP (for example Resend) before you invite friends.

**Edge functions:**

```bash
npx supabase secrets set NOTIFY_SECRET=PASTE-THE-SAME-RANDOM-STRING WEB_URL=https://your-web-app.vercel.app
```

```bash
npx supabase secrets set RESEND_API_KEY=re_xxx EMAIL_FROM="Leash <noreply@yourdomain.com>"
```

Deploy all edge functions (`notify`, `magic-vote`, `weekly-digest`, `delete-account`):

```bash
npx supabase functions deploy
```

Optional: if you turn on "Enhanced push security" in Expo, also set `EXPO_ACCESS_TOKEN`.

After changing a migration, regenerate the shared types:

```bash
npm run db:types
```

### 2. Web app

```bash
copy apps\web\.env.example apps\web\.env.local
```

Fill in the URL and anon/publishable key, then:

```bash
npm run web
```

Open http://localhost:3000. **Deploy:** import the repo in Vercel, set **Root Directory = `apps/web`**,
and add the same two `NEXT_PUBLIC_*` env vars.

### 3. iOS app (no Mac needed)

1. In `apps/mobile/app.json`, replace `com.yourname.leash` (in `ios.bundleIdentifier` and the
   `appGroup` of the `react-native-device-activity` plugin) with your own reverse-domain name, for example
   `com.alexk.leash`, and set both `YOUR_APPLE_TEAM_ID` values (developer.apple.com → Membership).
2. Create the env file:

```bash
copy apps\mobile\.env.example apps\mobile\.env
```

3. From `apps/mobile`, link the project to EAS and register your iPhone:

```bash
cd apps/mobile
```

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest init
```

```bash
npx eas-cli@latest device:create
```

4. Give EAS the same public env vars, because cloud builds don't see your git-ignored `.env`:

```bash
npx eas-cli@latest env:create --environment development --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR_PROJECT_REF.supabase.co --visibility plaintext
```

```bash
npx eas-cli@latest env:create --environment development --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR_KEY --visibility plaintext
```

5. Build the development client in the cloud. Let EAS create the certificates and the push key:

```bash
npx eas-cli@latest build --profile development --platform ios
```

6. Install the build on your phone from the link or QR code EAS gives you. Then start Metro on Windows:

```bash
npm start
```

If your phone can't reach your PC over Wi-Fi, use `npx expo start --dev-client --tunnel`.
You only need a new EAS build when native config or dependencies change. JS changes hot-reload.

### 4. Test the loop

1. Sign in on the phone as **you**, and on the website (another browser) as a **friend**.
2. Phone → Partners → invite the friend's username. The friend accepts on the web `/partners` page.
3. Phone → Home → **Allow Screen Time access** → add a daily limit, choose apps and set a few minutes.
   Use one of those apps until the shield appears, then tap **Ask for more time**. (Without Screen Time
   access, just tap **Request more time** on Home.)
4. The friend sees it on the dashboard (or gets a push/email) and approves.
5. The phone's request screen flips to **Approved** live.

---

## Ship to TestFlight

Do this only after Apple has approved **Family Controls (Distribution)** for all four bundle IDs (see
Prerequisites). Otherwise the build fails provisioning.

1. Create the app in [App Store Connect](https://appstoreconnect.apple.com) → Apps → **+**, using
   your bundle ID (`com.yourname.leash`).
2. Give the **production** EAS environment the same public variables as development (`--environment production`),
   including `EXPO_PUBLIC_WEB_URL`.
3. Build in the cloud:

```bash
npx eas-cli@latest build --profile production --platform ios
```

4. Upload it to TestFlight. EAS asks for your Apple ID the first time:

```bash
npx eas-cli@latest submit --platform ios --latest
```

5. In App Store Connect → TestFlight, add yourself and your partners as testers.

For the App Store listing you'll need:
- **Privacy policy URL:** `https://<your-web-app>/privacy` (the page is already built).
- **Account deletion:** already in the app (Settings → Delete account), which Apple requires.
- **App Review notes:** explain that Leash uses Family Controls with *individual* authorization so a person
  can restrict their own device, and give the reviewer a demo account with a partner.

---

## Useful scripts

| Command (repo root) | What |
|---|---|
| `npm run web` | Next.js dev server |
| `npm run mobile` | Metro for the dev client |
| `npm run typecheck` | Type-check all workspaces |
| `npm run db:push` | Apply migrations to the linked Supabase project |
| `npm run db:types` | Regenerate `packages/shared/src/database.types.ts` |
| `deno test supabase/functions` | Unit tests for edge-function helpers |

## Streaks & weekly digest (Phase 5)

- `user_stats(user)` (SQL) returns the **current streak** (full days since your last approved extension,
  counted in your time zone), your **best streak**, the last 7 days of requests, and how you behave as a
  partner over 30 days. Only you and your accepted partners can read it.
- Home (app) and the dashboard (web) show your streak. Partners see their friends' streaks.
- Every Sunday at 17:43 UTC, `pg_cron` calls the `weekly-digest` function, which pushes (or emails) each
  user a one-line summary of their week.
- **Delete account** (app Settings or web `/settings`) calls the `delete-account` function. It verifies your
  sign-in, tells your partners, and deletes everything.

---

## How app blocking works (Phase 3)

All of it is in `apps/mobile/src/screentime/index.ts`, built on
[`react-native-device-activity`](https://github.com/kingstinct/react-native-device-activity). Its config plugin
generates the three iOS extensions (ActivityMonitor, ShieldConfiguration, ShieldAction) during the EAS build.

- **Authorization:** `.individual` FamilyControls, for restricting yourself rather than a child.
- **Choosing apps:** the limit editor opens Apple's picker. The selection is an opaque token stored in
  the App Group under `limit_<id>`. App names never leave the phone, so the web dashboard shows only
  your limit's name.
- **Daily limits:** each one is a repeating 00:00–23:59 DeviceActivity monitor. When usage reaches the
  limit, the monitor extension shields the apps, even with Leash closed. At midnight it unshields them.
- **Shield:** a custom screen with **Ask for more time**. Tapping it posts a local notification that
  opens the request form. Apple doesn't let a shield open an app directly.
- **Approved extension:** the shield is lifted and a one-off `limit_<id>_ext` monitor re-shields after
  the granted minutes of *actual use*. A "General" request applies to every limit.
- **Sync:** Home calls `syncLimits()` so the phone matches the server. A monitor only restarts when that
  limit's minutes or apps change, so an active extension isn't wiped.

Known limit: **per-session limits are saved but don't block yet.** iOS has no notion of an "app session".

## Anti-cheat rules (Phase 4)

These rules are enforced in Postgres (`supabase/migrations/*_hardening.sql`), so neither app can skip them:

| You try to… | What happens |
|---|---|
| Tighten a limit (fewer minutes, stricter, more approvals, unpause) | Applies immediately |
| Loosen a limit (more minutes, less strict, fewer approvals, pause, daily→session) | Queued for **24 h**, partners alerted, cancellable. The current rule keeps blocking meanwhile |
| Delete an active limit | Scheduled for deletion in **24 h** (the limit keeps blocking) |
| Change a **Relaxed** limit | Applies immediately (that's what Relaxed means) |
| Remove an accepted partner | Takes **24 h**, and they can still vote meanwhile. Withdrawing an invite or a partner leaving is immediate |
| **Emergency unlock** | Up to 15 min with a reason, no approval, **once per 24 h**, and every partner is alerted |
| Revoke Leash's Screen Time access | Reported the next time the app opens, and partners get a ⚠️ alert |

The app also sends a heartbeat each time it opens, so partners see when you were last seen and whether
blocking is on (mobile Inbox, web dashboard). Queued changes are applied by a `pg_cron` job every 5 minutes.

What it still **can't** stop: deleting the app or turning off Screen Time for all apps in iOS Settings.
Keep the passcode trick below for that.

**Tip:** keep your brother's iOS Screen Time passcode protecting *Screen Time settings* and
*Deleting Apps*. That stops you from simply revoking the app's access, while Leash handles
day-to-day extensions.
