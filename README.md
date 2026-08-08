# Urban Beats — Attendance

A complete attendance system for the studio: admin and teacher roles, automatic month-wise
Excel generation, and live Google Drive backup. No manual work anywhere except renewing a
membership — that one's deliberately a human decision.

## Deploying (no terminal required) — one deploy, does everything

1. **GitHub** — create a new repository at github.com, then "Add file → Upload files" and drag
   this whole folder in (skip `node_modules` if present). Commit.
2. **Vercel** — create an account at vercel.com → "Add New… → Project" → import that repo.
3. **Database** — in the new Vercel project's **Storage** tab → **Create Database** →
   **Postgres** → **Connect**. `DATABASE_URL` is set automatically.
4. **Environment variables** — Settings → Environment Variables, add:
   - `SESSION_SECRET` — any long random string (one's provided in the deploy chat)
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` — see the
     Google Drive walkthrough you were given separately. If you don't have these yet, deploy
     anyway — attendance still works and backs up as soon as you add them later.
5. Click **Deploy**. Every table, the Prisma client, and the whole build happen automatically.
6. Open the live URL → you'll land on a one-time **"Set up your studio"** page → create your
   admin username/password → you're in. This page permanently disables itself after first use.
7. From inside the app: **Settings** page → paste your Google Drive folder ID → connected.
   Everything else — teachers, classes, students, attendance — is created from inside the app.

## What's automated (by design, not an accident)

- **No cron job for month-end rollover.** A new month's sheet is created the instant the first
  attendance of that month is submitted — not by a scheduled job that could silently fail.
  Functionally identical result, one less moving part that could break.
- **Attendance is the source of truth in Postgres.** The Excel file is *generated* from that
  data on every submission/edit, then pushed to Drive. If a Drive upload ever fails (bad
  internet, expired sharing), no attendance is lost — it's saved either way, and re-syncs
  automatically on the next edit. The admin Attendance page always shows if a class's sheet
  is out of sync.
- **Membership status is computed, not stored.** Active / Due soon / Overdue is calculated
  live from start date + duration — never goes stale, never needs a background job.
- **The 30-minute edit window is enforced server-side**, not just hidden in the UI. Once it
  passes, the original submission is permanently final — including if a teacher never touches
  the page again after submitting.

## Roles

- **Admin** — full access to everything: teachers, classes, students, attendance (viewable
  and directly editable as a live grid), memberships, other admins, and Drive settings.
- **Teacher** — sees only their assigned classes, submits attendance for today, can edit
  within 30 minutes of submission. Nothing else is editable.

## Local development (optional)

```
npm install
npx prisma migrate dev
npm run dev
```

Visit http://localhost:3000 — it sends you to the same one-time setup page.
