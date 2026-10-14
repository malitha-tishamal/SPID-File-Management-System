# SPID File Management System — Supabase Setup Guide

## 1. Required Environment Variables

Copy `.env.example` to `.env.local` and fill in the values from your Supabase
project (**Dashboard → Project Settings → API**):

| Variable | Where it is used | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key) | Browser + server | No |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server API routes only** | **YES — never expose** |
| `NEXT_PUBLIC_SITE_URL` | Password-reset redirect links | No |

- `.env.local` is git-ignored; never commit real keys.
- The service-role key bypasses Row Level Security. It is used only by trusted
  server-side code (approval workflow, session revocation, lockout RPCs,
  first-admin provisioning) and is never included in browser bundles.

## 2. Run the Database Migrations

In **Supabase Dashboard → SQL Editor**, run the files in this exact order:

1. `supabase/migrations/0001_core_schema.sql` — sections, profiles,
   login_security, audit_logs tables, indexes, constraints
2. `supabase/migrations/0002_rls_policies.sql` — Row Level Security policies
   (users cannot change their own role/status; admins managed via API)
3. `supabase/migrations/0003_auth_and_lockout_functions.sql` — auto-create
   pending profiles on signup, progressive lockout functions (60 s / 2 min /
   10 min) using database time and atomic row locks
4. `supabase/migrations/0004_storage_buckets_and_policies.sql` —
   `profile-images` (public) and `official-documents` (private) buckets with
   per-user folder policies for approved accounts

## 3. Authentication Settings (Dashboard → Authentication)

- **Email confirmation**: enable "Confirm email" if you want email
  verification. Verification alone never approves an account — approval is a
  separate administrator action.
- **Site URL**: set to your production URL (e.g. `https://spid.gov.lk`).
- **Redirect URLs**: add
  - `http://localhost:3000/auth/reset-password`
  - `https://<your-production-domain>/auth/reset-password`
- Rate limits: Supabase Auth applies its own limits; the app integrates with
  them instead of bypassing them.

## 4. Create the First Administrator

Public registration always creates a **pending Staff** account. The first
administrator is provisioned server-side:

```bash
node scripts/create-admin.mjs "Eng. K. L. Perera" "officer@spid.gov.lk" "YourStrongPass!23"
```

This creates an approved `Administrator` profile directly (no public signup).
Additional administrators can be promoted from the Admin → Users screen.

## 5. Local Development

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # vitest unit tests (validators + lockout schedule)
npm run build    # production build incl. type checking
```

If environment variables are missing, API routes return a clear
`CONFIG_ERROR` message listing the exact variable names (values are never
printed).

## 6. How the App Enforces Security

- **Registration** → Supabase Auth user + `pending` Staff profile (trigger
  `on_auth_user_created`). Requested role is stored for admin review only.
- **Login** → lockout checked first (DB clock), then credentials, then account
  status. Pending/disabled/locked/rejected accounts get their session
  destroyed immediately.
- **Progressive lockout** → 3 failures = 60 s, next 3 = 2 min, next 3 = 10 min
  (repeating). Stored in `login_security`; survives refresh/browser changes.
  Administrators can clear it via Admin → Users → Unlock.
- **Approvals** → Admin → Users (server-verified Administrator only), every
  action written to `audit_logs`. Disabling an account revokes its sessions.
- **Route protection** → `src/middleware.ts` verifies the session and the
  profile status/role in the database on every protected request.
- **Files** → uploads go to per-user folders; private documents use
  server-generated signed URLs.
