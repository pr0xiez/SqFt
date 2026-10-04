---
name: usability-audit
description: Audit SqFt's usability as a UX designer — is it easy to use, low cognitive load, fast for frequent tasks? Boots the app, drives the frequent-task flows at desktop + mobile widths via a Playwright driver that captures full-page screenshots, then reviews them against UX heuristics and reports findings ranked by importance. Use when asked to audit usability, do a UX review, evaluate ease of use, check cognitive load, or screenshot the app's flows.
---

# SqFt — Usability Audit

SqFt is a flooring-contractor estimating SaaS (`Customer → Location → SiteMeasure → Estimate`).
This skill audits it through the eyes of a **UX designer**: is each frequent task
easy to find and complete, is the screen's cognitive load reasonable, does the
mobile (field-crew) experience hold up?

The audit is **screenshot-driven**. `driver.mjs` logs in as the seeded demo
user and walks the app's frequent-task flows at **desktop (1280×900)** and
**mobile (390×844)** widths, dropping a full-page PNG + a plain-text dump at
each stop into `audit-artifacts/`. You then *read those artifacts* and write the
audit. The driver captures; the judgment is yours.

All paths below are relative to the repo root. The driver lives at
`.claude/skills/usability-audit/driver.mjs`.

## Prerequisites (macOS, ran on this machine)

The app needs a real Postgres (the Prisma `pg` adapter — no SQLite fallback)
and Playwright's Chromium.

```bash
brew install postgresql@16
brew services start postgresql@16
createdb sqft
npx playwright install chromium   # no-op if already cached
```

## Build / setup (one-time)

```bash
npm install
```

Create `.env` at the repo root (gitignored — local only):

```bash
cat > .env <<EOF
DATABASE_URL="postgresql://$(whoami)@localhost:5432/sqft"
AUTH_SECRET="local-dev-usability-audit-secret-do-not-use-in-prod"
RESEND_API_KEY=""
EMAIL_FROM="SqFt Quotes <quotes@sqft.dev>"
EOF
```

Apply migrations and seed the rich demo org (realistic customers, site
measures, estimates in every status — far better for a UX audit than empty
tables):

```bash
npm run migrate:dev
npm run seed:dev   # plants demo@sqft.dev / demo1234 + Johnson Flooring demo data
```

## Run the audit (agent path)

Start the dev server in one shell and leave it running:

```bash
npm run dev   # http://localhost:3000 — Ready in ~150ms
```

Then drive the tour:

```bash
# Both viewports, all 13 stops → audit-artifacts/{desktop,mobile}/*.png + *.txt
node .claude/skills/usability-audit/driver.mjs

# One viewport only (does NOT wipe the other viewport's artifacts)
node .claude/skills/usability-audit/driver.mjs --viewport=mobile

# A subset of stops by id
node .claude/skills/usability-audit/driver.mjs --only=estimate-builder,schedule
```

Output: `audit-artifacts/<viewport>/<stop-id>.png` (full page),
`<stop-id>.txt` (visible text, for reading copy / labels / density), and
`audit-artifacts/manifest.json` (every stop's final URL + any errors).

The 13 stops, in frequent-task order: `dashboard`, `customers-list`,
`customer-new` (add-a-lead slide-over), `customer-detail`, `site-measures-list`,
`site-measure-builder` (room measurement), `estimates-list`,
`estimate-builder` (**the core daily task — pricing a job**), `schedule`,
`settings`, `settings-members`, `settings-templates`, `settings-workspace`.

To audit a flow the tour doesn't cover, add a stop to the `STOPS` array in
`driver.mjs` (each is `{ id, title, run(page) }`) and re-run with `--only=<id>`.

## How to audit (the UX-designer pass)

Open every PNG with the Read tool and **actually look at it** — desktop and
mobile side by side for each surface. Read the `.txt` dump alongside to judge
labels, microcopy, and information density. Evaluate against:

1. **Frequent-task efficiency** — for the daily jobs (add a customer, take a
   site measure, build & send an estimate, schedule a crew): how many
   steps/clicks/screens? Is the primary action obvious and reachable? Are there
   dead-ends or detours?
2. **Cognitive load** — how much is on screen at once? Is there a clear visual
   hierarchy and one primary action per screen, or competing calls-to-action?
   Is terminology consistent (e.g. "Estimate" vs "Quote" vs "E#")?
3. **Feedback & system status** — does the UI show what's happening (loading,
   saved, errors)? Are empty/zero states explained? (e.g. a line item showing
   `$0.00` until "scope" is set — is that legible to a first-time user?)
4. **Error prevention & recovery** — are destructive actions guarded? Is
   required-vs-optional clear? Can a user undo?
5. **Mobile / field-crew fitness** — crews live on phones on a job site.
   Does each screen reflow sensibly, or is it a shrunk desktop layout? Are tap
   targets adequate? Does anything require horizontal scrolling?
6. **Consistency & affordances** — do things that look clickable behave
   consistently? Do similar actions look similar across screens?

Then **present findings ranked by importance** — order by (user impact ×
frequency of the affected task), most important first. For each finding give:
the surface + artifact filename, what the user is trying to do, the specific
problem (cite what's visible in the screenshot), the UX principle it violates,
and a concrete fix. Lead with a one-line severity (Critical / High / Medium /
Low / Nit). Call out what works well too — an audit that only lists problems
is not trustworthy.

## Gotchas (learned the hard way)

- **No local Postgres ships with this app.** Without `DATABASE_URL` pointing at
  a running Postgres, every authenticated page silently redirects to `/login`
  and the whole tour screenshots the login screen. If stops land on `/login`,
  the DB/session is the cause, not the driver.
- **Don't click nav chrome to reach rows.** The desktop top-nav has a sign-out
  avatar button; an early version of the driver clicked it by index mid-tour
  and lost the session for every later stop. The driver now scopes all row
  clicks to `<main>`. Keep new stops inside `<main>`.
- **List rows are `<button>`s, not `<a>`s** (they `router.push` on click).
  Customer rows are matched by their `data-customer-row` attribute
  (`main button[data-customer-row]`) to avoid hitting a column-sort header; estimate and
  site-measure rows are matched by their `#<number>` label.
- **Client-fetched detail pages flash "Loading…".** The estimate/site-measure
  detail screens hydrate via React Query *after* navigation, so a naive
  screenshot catches a blank "Loading estimate…". The driver's `settle()` waits
  for any "Loading" text to detach before shooting.
- **Dev-only chrome pollutes screenshots.** The Next.js dev indicator
  ("N · 1 Issue") and the React Query devtools button are injected in dev. The
  driver hides them with an injected stylesheet before each shot — they are not
  product UI, don't report them as findings.
- **`audit-artifacts/` is wiped per-viewport, not globally.** A `--viewport=X`
  run only cleans `audit-artifacts/X/`, so you can run desktop and mobile
  separately and keep both. It's gitignored.

## Troubleshooting

- **All stops show the login page** → DB not reachable / not seeded. Confirm
  `brew services list` shows `postgresql@16 started`, `psql -d sqft -c '\dt'`
  lists tables, and `.env` `DATABASE_URL` matches (`$(whoami)@localhost:5432/sqft`).
- **`Executable doesn't exist … chromium`** → run `npx playwright install chromium`.
- **Driver hangs on login** → dev server isn't up. `curl -so /dev/null -w '%{http_code}' http://localhost:3000/login` should print `200`.
- **`createdb: database "sqft" already exists`** → harmless; reuse it, or
  `dropdb sqft && createdb sqft` then re-run migrate + seed for a clean slate.
- **A row-click stop times out** after a UI change → the row selector drifted;
  update the matcher in that stop's `run()` (see Gotchas for the current ones).
