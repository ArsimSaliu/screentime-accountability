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
| 3 | Real Screen Time blocking (FamilyControls / DeviceActivity / ManagedSettings) | ⏳ next, needs Apple entitlement |
| 4 | Hardening: tamper alerts, "loosening takes 24 h", break-glass override | planned |
| 5 | Analytics, streaks, widgets, TestFlight / App Store | planned |

Until Phase 3, the app's **"Request more time"** button simulates hitting a limit,
so you can test the whole approval loop end to end.

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
   In Phase 3 the app lifts the shield for the granted minutes.
5. `pg_cron` expires unanswered requests every minute.

Security is enforced in the database, not the apps: clients cannot set a request's status,
vote on their own request, vote twice, vote after expiry, or edit someone else's partnership.

---

## Setup (Windows)

### 0. Prerequisites

- Node.js 22 LTS, Git (`git config --system core.longpaths true` in an admin shell)
- Accounts: [Supabase](https://supabase.com), [Expo](https://expo.dev), [Vercel](https://vercel.com),
  [Apple Developer Program](https://developer.apple.com/programs/) ($99/yr)
- **Request the Family Controls entitlement now** (needed for Phase 3, approval takes time):
  https://developer.apple.com/contact/request/family-controls-distribution
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

```bash
npx supabase functions deploy notify
```

```bash
npx supabase functions deploy magic-vote
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

1. In `apps/mobile/app.json`, replace `CHANGE_ME` in `bundleIdentifier` and the App Group
   with your own reverse-domain name (for example `com.alexk.leash`).
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
3. Phone → Home → add a limit → **Request more time**.
4. The friend sees it on the dashboard (or gets a push/email) and approves.
5. The phone's request screen flips to **Approved** live.

---

## Useful scripts

| Command (repo root) | What |
|---|---|
| `npm run web` | Next.js dev server |
| `npm run mobile` | Metro for the dev client |
| `npm run typecheck` | Type-check all workspaces |
| `npm run db:push` | Apply migrations to the linked Supabase project |
| `npm run db:types` | Regenerate `packages/shared/src/database.types.ts` |

---

## Phase 3 plan: Screen Time

The integration point is already stubbed: `apps/mobile/src/screentime/index.ts`
(`ScreenTime.grantExtension()` is called when a request is approved).

1. Add [`react-native-device-activity`](https://github.com/kingstinct/react-native-device-activity)
   with its config plugin. It generates the DeviceActivityMonitor, ShieldConfiguration and
   ShieldAction extension targets and shares state through the App Group.
2. Request `.individual` FamilyControls authorization, then show the `FamilyActivityPicker`
   in the limit editor and store the opaque selection on-device, keyed by limit id.
3. For each limit, schedule a DeviceActivity event at the limit's minutes. The monitor extension shields
   the selected apps when it fires.
4. Shield button "Request more time" → local notification → opens `/request/new`.
5. On approval, `grantExtension` clears the shield and schedules a one-off threshold for the granted
   minutes, after which the monitor re-shields.
6. Tamper signals: report authorization revocation to the server and alert partners.

**Tip:** keep your brother's iOS Screen Time passcode protecting *Screen Time settings* and
*Deleting Apps*. That stops you from simply revoking the app's access, while Leash handles
day-to-day extensions.
