# SqFt UX design review (Taste Skill pass), November 2026

A review of the authed app, the customer-facing review pages and the login,
held against [Taste Skill](https://github.com/leonxlnx/taste-skill) 2.5, as the
brief for a full redesign.

**Method.** I ran the app locally against the seeded demo org
(`demo@sqft.dev`) and captured 20 screens at 1280x900 and 390x844 with the
`usability-audit` driver, plus full-height captures of the dashboard, estimate
builder, customer hub, settings and both public review pages. I read
`app/globals.css`, `docs/design-system.md`, `components/ui/*` and the main
screen components, and pulled counts from the code with grep. Seed data
("Pagination Customer 120", "+128 vs last week") is a fixture, so I only
report it where the layout makes it look worse than it should.

---

## 1. How the Taste Skill applies to SqFt

Taste Skill is written for **marketing and company websites**: one section per
screen, photographs on every screen, shader effects for tech brands, a 60 to
80 word budget per screen. Most of its page-structure rules do not apply to a
dense, authed work tool, and following them literally would make SqFt worse.

| Taste Skill rule | Applies to the app? | Where it applies |
|---|---|---|
| One system: one button pair, one radius, one card recipe, one link look, one heading scale | **Yes, fully** | Everywhere |
| Copy: headings name things, buttons are a verb plus an object, sentence case, no questions as headlines, one fact in one wording | **Yes, fully** | Everywhere, most of all on customer-facing pages |
| Colour: interface 90 to 95% neutral, one accent under 3% of a screen, **exactly one filled button per view** | **Yes** | Everywhere |
| Two boxes deep at most, never text in a box in a box | **Yes** | Detail pages |
| Nothing under 13px; text people read at 16px | **Adapted**: 14 to 15px for dense desktop tables, 16px for phones | Everywhere |
| Hover layer (button step and press, linked card lift 2px, drawn underlines, focus ring), nothing moving on scroll | **Yes** | Everywhere |
| Links go where their label says, every link lands | **Yes**, and it rules out rows that are `<button>`s | Lists |
| First screen says what it is, with one hard fact | **Adapted**: the first screen of each page says what needs doing | Dashboard, public pages |
| One section per screen, hero rules, photographs, effects, scenes, word budget | **No** | Only `www/` and the login |

The customer-facing estimate and invoice pages sit halfway: they are documents
a homeowner reads once, so the copy, colour and "one hard fact" rules apply in
full there. The marketing site `www/` should get a separate, literal Taste
Skill pass (see section 6).

---

## 2. What already works (keep it)

The foundations are better than most apps at this stage. A redesign should
keep its identity and change its structure.

- **A real point of view.** Archivo set wide for display, JetBrains Mono for
  figures only, safety orange on a warm off-white. It looks like the trade, not
  a template. Keep it.
- **A disciplined token layer.** One 6px radius, neutral `--bg`/`--surface`/
  `--ink` tokens, a full dark theme, no violet, no shadows on cards, no
  uppercase micro-labels (0 `uppercase` in the code). This already meets most
  of Taste Skill's colour and shape rules.
- **The tape meter** (`TapeMeter`, the paginator ruler) is a brand device
  tied to real data. It is the one "moment" the app needs.
- **Status badges** use tone, icon and label together, so they read without
  colour.
- **Login** (`app/(auth)/login`) is the best screen: a real photograph of the
  work, a plain h1, one primary button, one line of copy. It is the bar for the
  rest of the app.
- **The record trail** (breadcrumbs from customer to invoice) and the
  `JobProgressStrip` already describe the job as one chain. The redesign below
  builds on that.

---

## 3. Findings, ranked

Ranked by user impact times how often the affected task happens. Each finding
gives the screen, what is wrong, the rule it breaks and the fix.

### Critical

**C1. Money is formatted three different ways, and the customer sees it
without thousands separators.**
`fmtDollar` (`lib/utils.ts:30`) is `` `$${n.toFixed(2)}` ``, so the public
estimate reads "Total due **$2643.25**", "Deposit due: $1321.63", and the
schedule backlog reads "$2866.00". The estimates list rounds to whole dollars
("$280") while the builder shows "$279.92" for the same estimate. Empty values
render "—", against the design system's own "empty values render `-`" rule.
*Rule:* one fact, one wording; numbers in their real form.
*Fix:* one `Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`
formatter with grouping, used everywhere. Decide once whether lists show cents
(they should, for a document that gets signed). Low effort, high trust gain:
do it first.

**C2. Every screen has two filled orange buttons.**
The sidebar "+ New" is a full-width orange button that is always on screen,
and each page has its own orange primary ("Send to customer", "Record
payment", "Revise", "+ Create Estimate"). On phones the tab bar adds an orange
"New" cell beside the page's orange button. On the schedule, orange also fills
the today column, every event block, the unscheduled count and every
"waiting 173d" label.
*Rule:* exactly one filled button marks the main action in any view; the accent
stays under 3% of a screen.
*Fix:* make "New" an ink-outline button (or the ink `variant`) in the side
nav, and a neutral centre icon on the tab bar. Keep orange for the page's one
main action, focus, the tape blade and the active nav mark. Status and
lateness use `--warn`/`--bad` text, not orange fills.

### High

**H1. The dashboard opens with a greeting instead of the work.**
The first screen is "Good evening, Mike.", five counters, and a schedule of
events that are all struck through. The one thing that needs action, "34
expiring soon", is a 13px red sub-line under a counter. Below the fold, a $0
revenue card with four empty weekly bars takes a full row, and "Recent site
measures" repeats the Site Measures list (8 rows of "No estimate yet").
*Rule:* the first screen says the one thing and one hard fact; no greetings;
no fact twice.
*Fix:* replace it with a **Today** screen built as a queue (section 5.2):
estimates expiring, drafts not sent, approved jobs with no date, invoices
overdue, today's crews. Each row ends in its one action. Counters move to a
thin strip that links into filtered lists.

**H2. The estimate builder, the core daily task, is a form inside a table.**
Each line item shows seven controls at once: name, a "Use template" select, an
always-open description textarea, a "Set scope…" select, quantity, unit, rate
and a delete button. A line with no quantity shows a "Quantity unset" pill in
the Subtotal column and an amber left-edge bar. The total sits in a solid
black slab, the deposit in green below it, and "+ Add Line Item" is a dashed
ghost box (a third button style). The site measure page repeats the black slab
for "Gross area".
*Rules:* never text in a box in a box; highlight by contrast, never by a
coloured bar; one button pair; one size per kind of figure.
*Fix:* make the estimate a **document you edit in place** (section 5.3): lines
read as text and turn into fields on focus; "Add line item" opens a
searchable price book (templates become the add flow rather than a per-row
select); totals, deposit and "Send to customer" sit in a sticky summary rail
on desktop and a sticky footer on phones. The total is the one large figure,
with no slab.

**H3. 22 different font sizes.**
The code uses 22 arbitrary `text-[Npx]` sizes, among them 10, 11.5, 12, 12.5,
13, 13.5, 14, 14.5, 15, 16, 17, 18 and 19px (91 uses of 14px, 80 of 13px, 47
of 13.5px, 27 of 14.5px, 19 of 12.5px). Half-pixel steps are not visible as
different sizes, so they read as drift.
*Rule:* one heading scale; one size per kind of element; nothing under 13px.
*Fix:* a six-step scale as tokens (`--t-meta 13`, `--t-body 15` (16 on
phones), `--t-lead 17`, `--t-h3 20`, `--t-h2 28`, `--t-h1 40`), Tailwind theme
entries for them, and a lint or grep check in CI that fails on new
`text-[Npx]`.

**H4. Customer-facing estimate page: question headline, thin content, no
contractor identity.**
The homeowner sees an eyebrow "Site Measure & Proposal", an h1 that just says
"Estimate", a single line "LVP install $2643.25" with no quantity or rate,
then "Ready to move forward?" and "Approve & get on the schedule". The
contractor is a bold name with no logo, phone or licence line.
*Rules:* the h1 names the thing and the buyer or place; one hard fact on the
first screen; no questions as headlines; buttons are a verb plus an object; no
ampersands as copy.
*Fix:* h1 "Flooring estimate for 1247 Elm St", the total and deposit as the
hard fact beside it; rooms and line items with area, rate and amount (the
customer is paying per square foot, so show it); contractor block with logo
and contact; the action "Approve estimate", with "Decline" as the secondary.
This page decides whether the contractor gets paid, so it should get the most
care, not the least.

**H5. List rows are buttons, not links.**
Customer, estimate and site-measure rows are `<button>`s that call
`router.push` (15 call sites in `components/`). Users cannot cmd-click into a
new tab, middle-click, copy a link or see the URL on hover, which contractors
comparing two estimates will want.
*Rule:* links go where their label says, and every link lands.
*Fix:* rows become `<Link>`s (one link per row, the record number or name as
its label; the whole row is the hit area through a stretched link). Update the
`usability-audit` driver and e2e selectors that match `main button`.

### Medium

**M1. Inconsistent buttons and copy.**
Nine buttons use a typed "+" with Title Case ("+ Create Estimate", "+ Add
Room", "+ Add Line Item", "+ Add Note", "+ Add location", "+ dimension"),
next to buttons that use a Phosphor icon and sentence case ("Create invoice").
Both break `docs/design-system.md` (no text glyphs as icons, sentence case).
A record is "E#5089", "#5089" and "Estimate #5089" on three screens, and
"Site Measure #1167" in a title but "Site measure #1167" in the breadcrumb.
Rows end in a repeated "Open >".
*Fix:* every add button is `<Button>` with `Plus` and a sentence-case verb
plus object ("Add room", "Add line item"). One record label per type
("Estimate 5089" or "#5089", picked once). Drop "Open" when the row is the
link.

**M2. Card soup: everything boxed with equal weight.**
The customer hub stacks a stat strip, Pipeline, Invoices, Activity, Upcoming,
Contact and Locations as seven bordered cards of the same weight; the Pipeline
card holds a shaded row with more rows inside it. The site measure page has a
location card, an estimates card, a room card with filled fields inside, two
dashed add boxes and a black slab. Nothing leads.
*Rule:* two boxes deep at most; group with spacing and hairlines; one block
template repeated.
*Fix:* one main column of open sections divided by hairlines, a right rail for
reference data (contact, locations) without boxes, cards only for things you
can click.

**M3. The Schedule Manager truncates the thing you came to read.**
Overlapping events become columns 30px wide: "C…", "W…", "M…", "S…". The
crew filter row runs off the right edge ("Sam" is cut off). Every backlog card
carries "waiting 173d" in orange mono, so lateness stops meaning anything.
*Fix:* a crew-lane view (one row per crew member across the week) as the
default for dispatch, with the hour grid as the day view; the crew filter
wraps or becomes a select; lateness turns `--warn` only past a threshold.

**M4. The dashboard schedule reads as cancelled.**
Finished events get a strikethrough and a green tick, so a normal working day
looks like a list of cancellations. "Crew today" runs the time straight after
the title in mono with no separator ("Day 2 08:00-16:00") and truncates it
("10:00-…").
*Fix:* past events dim to `--muted` with a "Done" tag; time goes first in its
own column, as on the schedule card.

**M5. Text size on phones.**
Body and table text is 13 to 14.5px, and labels are 13px in `--muted`. Crews
read this outdoors on a phone.
*Fix:* 16px body and field text under 640px (fields already do this), 14px
minimum for meta.

### Low

- **L1. Motion is thin, not wrong.** Buttons press (`active:scale-[0.98]`)
  but do not step on hover, and linked cards do not lift. Add Taste Skill's
  hover layer (140ms in, 200ms out, 1px button step, 2px card lift, drawn
  underline on text links); keep everything still on scroll, as it is now.
- **L2. The "Available rooms" line** above the builder is a sentence of room
  chips with no action. Fold it into the scope picker.
- **L3. Settings** is a flat index. Group it into Company, Team, Pricing,
  Payments and Integrations.

---

## 4. Redesign direction: "the job, not the record"

Keep the identity (type, orange, mono figures, tape). Change three things:

1. **Organise around the job.** Users think in jobs moving through stages;
   the app makes them visit four record types (customer, site measure,
   estimate, invoice). The estimate already carries the job's state
   (`computeJobProgress`). Make it the spine of navigation.
2. **One action per screen, said plainly.** Every screen answers "what do I do
   next?" with one orange button whose label names the transaction.
3. **Documents over forms.** Estimates and invoices are documents the customer
   signs. Edit them as documents.

### 4.1 Navigation

| Now | Proposed |
|---|---|
| Dashboard | **Today**: the action queue |
| Customers, Site Measures, Estimates, Invoices | **Jobs** (one list or board by stage: Measure, Quote, Sent, Approved, Scheduled, Billed, Paid) and **Customers** |
| My Schedule, Schedule Manager | **Schedule** (crew lanes for leads, my day for crew) |
| Invoices list | **Money**: invoices, payments, Stripe and QuickBooks state |
| Settings | Settings, grouped |

Site measures stay as records, reached through a job or a customer; "+ New"
stays as the one quick-create menu.

---

## 5. Screen blueprints

Figures in the sketches below are illustrative, not the seed data.

### 5.1 System (do first)

- Money formatter (C1), type scale tokens (H3), the one-orange rule (C2).
- `Button` everywhere: replace typed "+" buttons and the dashed ghost boxes.
  Fold `ink` into `default`/`primary` so the system has one button pair plus
  `ghost` and `danger`.
- Rows as links (H5). Hover layer (L1).
- A CI check that fails on new `text-[Npx]`, typed `+`/`→` glyphs in JSX text,
  and raw hex colours.

### 5.2 Today

```
Today, Friday 6 November                            [ New ▾ ]  (outline)

Needs you  ─────────────────────────────────────────────────────────
 34  Estimates expire this week          Henderson, J. · $2,866.00   [Follow up]
  3  Drafts not sent                     Chen staircase · $4,120.00  [Finish]
 17  Approved jobs with no date          Williams bath · 188 days    [Schedule]
  2  Invoices overdue                    Invoice 2 · $361.33         [Record payment]

Crews today ────────────────────────   This month ─────────────────
 08:00  Carlos   Chen staircase, day 2  Booked  $0 of $65,000  ▕tape▏
 08:30  Dave     Williams bath, day 1   Sent 71 · Approved 19 · Win 0%
```

Each group shows its top three rows and a "See all 34" link into the filtered
list. No greeting, no empty $0 chart.

### 5.3 Estimate editor

```
Henderson, J. › 1247 Elm St › Estimate 5006           Draft

Living room 252 sqft · Master bedroom 195 sqft · Hallway 48 sqft

LVP install           Living room, Bedroom   447 sqft  × $4.85   $2,167.95
Floor prep            All rooms              495 sqft  × $0.65     $321.75
[ Add line item ]  (opens price book search)
                                                   ┌────────────────────────┐
                                                   │ Subtotal     $2,489.70 │
                                                   │ Markup 35%     $871.40 │
                                                   │ Total        $3,361.10 │
                                                   │ Deposit 50%  $1,680.55 │
                                                   │ [ Send to customer ]   │
                                                   └────────────────────────┘
```

Lines are text until focused; the description, template and scope controls
appear in the focused row only. Rooms are chosen per line from the site
measure, so "Set scope…" disappears as a term. Validation sits inline in the
row ("Add a quantity"), not in the Subtotal column. On phones each line is a
row that opens a sheet, and the summary is a sticky footer with the total and
the one button.

### 5.4 Lists

Compact rows (48px) by default with the density toggle kept; the record label
is the link; status, total (with cents) and age right-aligned; saved filters
("Expiring", "Unsent") as pills. Phones show two lines per row and no repeated
"No estimate yet".

### 5.5 Schedule

Crew lanes for the week (crew down, days across), events as full-width bars in
their lane, unscheduled jobs as a side list you drag from. Day view keeps the
hour grid. Orange only for the selected event and the now line.

### 5.6 Customer-facing estimate and invoice

Apply Taste Skill in full: h1 names the thing and the address, the total and
deposit as the hard fact, rooms and lines with area and rate, contractor
block with logo and contact, one action ("Approve estimate", "Pay $361.33"),
sentence case, no question headline, no ampersand. Same layout for the
invoice, with payments listed.

---

## 6. The marketing site (`www/`)

`www/` is the one surface Taste Skill was built for, and it is close: plain
section headings, two button labels, real photographs. Two changes it would
ask for: the h1 "From tape measure to paid invoice." is a brand line where it
wants the category and the buyer ("Estimating and invoicing software for
flooring contractors"); and a software page leads with its own product UI in
one app frame, so the hero should show the estimate editor from 5.3, built as
live HTML. Run the skill's own checker (`consistency.mjs`, `check.mjs`) on it
as a separate change.

---

## 7. Suggested order

1. **Foundations** (small PRs, low risk): money formatter, one-orange rule,
   type scale and CI check, `Button` for every add action, rows as links,
   hover layer.
2. **Customer-facing pages**: the estimate and invoice documents (5.6).
   Highest trust per hour of work.
3. **Today** replaces the dashboard (5.2).
4. **Estimate editor** (5.3), with the price book as the add flow.
5. **Navigation by job** (4.1) and the open-section detail layout (M2).
6. **Schedule crew lanes** (5.5).

Each step keeps existing accessible names where e2e tests select by them, or
updates the tests in the same change, as `docs/design-system.md` requires.
