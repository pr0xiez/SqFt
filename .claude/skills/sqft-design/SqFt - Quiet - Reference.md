# SqFt Quiet — Component & Design Reference

Authoritative reference for `SqFt - Quiet.html`. Use this instead of reading the full HTML file. The prototype is a single-page app with embedded CSS and inline JS event handlers; logic lives in the separate `quiet-app.js`.

---

## 1. Design Tokens

All tokens are CSS custom properties on `:root`. Dark theme overrides live on `[data-theme="dark"]`.

### Colors — Light Theme

| Token | Value | Role |
|-------|-------|------|
| `--bg` | `#fafaf7` | Page background |
| `--surface` | `#ffffff` | Cards, panels, inputs |
| `--surface-2` | `#f4f3ed` | Secondary surfaces, table headers |
| `--ink` | `#1a1a17` | Primary text |
| `--ink-2` | `#3a3a35` | Secondary text |
| `--muted` | `#6b6b66` | Helper text, labels, disabled |
| `--line` | `#e6e4dd` | Borders, dividers |
| `--line-2` | `#d8d6cd` | Subtle borders |
| `--accent` | `#c0341a` | Vermilion — primary action, danger, today |
| `--accent-l` | `#e04828` | Accent hover/light |
| `--accent-d` | `#8a2010` | Accent dark |
| `--sage` | `#3d6b4a` | Success, linked, paid |
| `--sage-l` | `#588a66` | Sage light |
| `--gold` | `#b07a1a` | Warning, visits |
| `--gold-l` | `#d4982a` | Gold light |

### Colors — Dark Theme

| Token | Value |
|-------|-------|
| `--bg` | `#0f0f0d` |
| `--surface` | `#181815` |
| `--surface-2` | `#222220` |
| `--ink` | `#f0eee5` |
| `--ink-2` | `#c9c6bc` |
| `--muted` | `#888579` |
| `--line` | `#2a2a26` |
| `--line-2` | `#363632` |
| `--accent` | `#ff6a44` |
| `--accent-l` | `#ff8665` |
| `--accent-d` | `#d44e2c` |
| `--sage` | `#7fbf90` |
| `--sage-l` | `#9bd4ab` |
| `--gold` | `#e0b04a` |
| `--gold-l` | `#f0c25a` |

Shadow dark: `0 1px 2px rgba(0,0,0,.3), 0 4px 14px rgba(0,0,0,.25)`

### Typography

| Token | Value |
|-------|-------|
| `--display` | `'Inter Tight', sans-serif` |
| `--mono` | `'JetBrains Mono', monospace` |

**Weights loaded:** Inter Tight 400/500/600/700/800 · JetBrains Mono 400/500/600

**Type scale:**

| Class / Element | Size | Weight | Notes |
|-----------------|------|--------|-------|
| `.h1` | 36px | 700 | –0.025em, lh 1.05 |
| `.h1 .light` | 36px | 400 | Secondary heading span |
| `.m-val`, `.s-val` | 28px | 700 | Metric / summary value, –0.025em |
| `.li-total-val` | 22px | 700 | Line-item total, –0.025em |
| `.cd-name-input` | 28px | 700 | Customer name editable heading |
| `.cb-name` | 16px | 600 | Customer bar name |
| `.room-name` | 15px | 600 | Editable room name |
| `.cal-title` | 15px | 600 | Calendar month/week heading |
| `.card-t` | 14px | 600 | Card title, –0.01em |
| `.cl-name`, `.pj-name`, `.li-name` | 14px | 600 | List item names |
| Body / `.td` | 13–14px | 400 | Default |
| `.el-num` | 13px mono | 600 | Estimate number |
| `.cal-day-num` | 18px | 600 | Calendar day number |
| `.btn`, `.nav-tab`, `.eyebrow` | 11px mono | 500 | 0.02–0.04em tracking |
| `.m-label`, `.th` | 10px mono | — | Uppercase, 0.06–0.08em |

### Spacing & Radius

| Token | Value |
|-------|-------|
| `--r` | `8px` — base border-radius |
| `--shadow` | `0 1px 2px rgba(20,18,12,.04), 0 4px 14px rgba(20,18,12,.04)` |

Common padding patterns: `20px` (cards/metrics), `14px 18px` (bars), `9px 16px` (buttons), `11px` (table rows), `24px` (panels/detail cards).

---

## 2. Screens

All screens use `.screen` (display none, max-width 1200px, 32px padding). Active screen gets `.screen.active` + `fade` animation (opacity 0 → 1, translateY 4px → 0, 0.25s).

| Screen ID | Purpose | Key Components |
|-----------|---------|----------------|
| `#screen-dashboard` | Main overview | `.metrics`, alerts, `.pipe` (pipeline), revenue card with Chart.js, `.today` (schedule) |
| `#screen-customers` | Customer list | `.filter-bar`, `.table.t-cust` |
| `#screen-customer-detail` | Single customer | `.cd-card`, estimate history table |
| `#screen-estlist` | All estimates | `.filter-bar`, `.table.t-est` |
| `#screen-estimates` | Room measurer / estimate builder | `.cust-bar`, `.room` blocks, area summary |
| `#screen-quote` | Quote / line-item builder | `.cust-bar`, `.li-table`, `.summary` |
| `#screen-schedule` | Weekly calendar | `.cal` |

---

## 3. Components

### Navigation — `.nav`

Height 60px, sticky top 0, border-bottom, bg `--surface`, z-index 50.

| Sub-element | Description |
|-------------|-------------|
| `.brand` | 18px, weight 800; `<em>` child uses `--accent` color |
| `.nav-tab` | 11px mono, 0.02em, transparent bg; `.active` gets 2px bottom border in `--accent` |
| `.nav-r` | Right cluster (flex, gap 10px) |
| `.theme-toggle` | 11px mono, border, 6px 10px padding, rounded |
| `.avatar` | 30×30px circle |

---

### Buttons — `.btn`

Base: 11px mono, 9px 16px padding, inline-flex center, gap 6px, rounded 6px, 0.02em tracking.

| Variant | Background | Color | Hover |
|---------|-----------|-------|-------|
| `.btn-primary` | `--ink` | `--bg` | `--ink-2` bg |
| `.btn-accent` | `--accent` | `#fff` | `--accent-l` bg |
| `.btn-ghost` | transparent | `--ink` | `--surface-2` bg |

Wrap in `.actions` (flex, gap 8px, flex-wrap on mobile) to group buttons.

---

### Alerts — `.alert`

12px padding, border-left 3px, flex gap 14px. Hover: translateX 2px + shadow.

| Modifier | Border/icon color |
|----------|------------------|
| `.alert.danger` | `--accent` |
| `.alert.warn` | `--gold` |

Sub-elements: `.alert-body` (flex 1, ink), `.alert-cta` (11px mono, weight 500).

---

### Metrics Grid — `.metrics`

4-column grid with 1px gap (gap itself renders as divider lines via bg color on the grid container). Each cell is `.metric` with 20px padding.

| Sub-element | Description |
|-------------|-------------|
| `.m-label` | 10px mono, uppercase, 0.06em |
| `.m-val` | 28px, weight 700, –0.025em |
| `.m-val.verm` | `--accent` color |
| `.m-val.sage` | `--sage` color |
| `.m-val.gold` | `--gold` color |
| `.m-sub` | 10px mono, muted |
| `.m-sub.up` | `--sage` (positive delta) |
| `.m-sub.down` | `--accent` (negative delta) |

Collapses to 2 columns at 880px.

---

### Cards — `.card`

Border 1px `--line`, radius `--r`, padding 20px.

| Sub-element | Description |
|-------------|-------------|
| `.card-h` | flex space-between, margin-bottom 14px |
| `.card-t` | 14px, weight 600, –0.01em |
| `.card-s` | 11px mono, muted |

---

### Pipeline — `.pipe`

4-column grid (collapses to 2 at 880px). `.pipe-h` is a column header: 9px mono, uppercase, border-bottom, 0.08em.

Each job is `.pipe-job`: 9–10px padding, bg `--surface-2`, border, rounded 6px, cursor pointer. Hover: border update + translateY –1px.

| Sub-element | Description |
|-------------|-------------|
| `.pj-name` | 13px, weight 600 |
| `.pj-sub` | 10px mono, muted |
| `.pj-amt` | 11px mono, weight 600 |
| `.pj-amt.paid` | `--sage` |
| `.pj-amt.late` | `--accent` |

---

### Today Schedule — `.today`

Row: 11px padding vertical, border-bottom, flex gap 14px.

| Sub-element | Description |
|-------------|-------------|
| `.dot` | 6×6px circle, flex-shrink 0; color varies by event type |
| `.t-time` | 11px mono, muted, min-width 50px |
| `.t-name` | 13px, weight 600, –0.01em |
| `.t-sub` | 10px mono, muted, margin-top 2px |
| `.t-tag` | 10px mono, muted, margin-left auto |

---

### Filter Bar — `.filter-bar`

Flex, wrap, gap 8px.

| Element | Description |
|---------|-------------|
| `.filter` | 11px mono, 6px 12px padding, border, rounded 6px, cursor pointer |
| `.filter.active` | bg `--ink`, color `--bg` |
| `.filter-count` | 11px mono, muted, margin-left auto |

---

### Customer Table — `.table.t-cust`

Grid columns: `1fr 130px 100px 90px 80px`. Each `.tr` has a 3px left border color indicating lead source:

| Class | Color |
|-------|-------|
| `.tr.phone` | `--sage` |
| `.tr.online` | `--gold` |
| `.tr.referral` | `--accent` |
| `.tr.walkin` | `--muted` |
| `.tr.website` | `--ink-2` |

Row hover: bg `--surface-2`.

| Cell class | Description |
|------------|-------------|
| `.cl-name` | 14px, weight 600, –0.01em |
| `.cl-contact` | 10px mono, muted |
| `.cl-est` | 16px, weight 600 |
| `.badge` | 9px mono, 3px 8px padding, border 1px currentColor, rounded 4px, weight 500 |
| `.b-phone/.b-online/.b-referral/.b-walkin/.b-website` | Source-colored badge variants |

Table structure: `.thead` (bg `--surface-2`, border-bottom) → `.th` (10px mono, uppercase, 0.06em) → `.tr` rows → `.td` cells.

---

### Estimate Table — `.table.t-est`

Grid columns: `80px 1fr 130px 110px 80px`.

| Cell class | Description |
|------------|-------------|
| `.el-num` | 13px mono, weight 600 |
| `.el-cname` | 14px, weight 600, –0.01em |
| `.el-caddr` | 10px mono, muted, nowrap, text-overflow ellipsis |
| `.el-area` | 13px, weight 600 |
| `.el-detail` | 10px mono, muted |
| `.open-btn` | 10px mono, 5px 12px padding, transparent/muted; border+color appear on `.tr:hover` |

---

### Customer Bar — `.cust-bar`

Context strip showing active customer at top of estimate/quote screens. Flex, gap 14px, 14px 18px padding, border-left 3px `--accent`.

| Sub-element | Description |
|-------------|-------------|
| `.cb-eyebrow` | 10px mono, muted, uppercase, 0.04em, margin-bottom 3px |
| `.cb-name` | 16px, weight 600, –0.01em |
| `.cb-detail` | 11px mono, muted, margin-top 2px |
| `.cb-actions` | margin-left auto, flex gap 8px |

---

### Room Builder — `.room`

Border 1px, radius `--r`, padding 18–20px, margin-bottom 10px. `.room.l-shape` adds border-left 3px `--gold`.

| Sub-element | Description |
|-------------|-------------|
| `.room-h` | flex gap 10px, margin-bottom 14px |
| `.room-name` | 15px, weight 600; inline editable input, border-bottom appears on focus |
| `.dim-row` | flex gap 10px, margin-bottom 12px |
| `.dim-label` | 11px mono, muted, min-width 80px, 0.04em |
| `.dim` | 64px wide input; 14px, weight 600; bg `--surface-2`; color `--accent`; centered; border `--line`; focus border `--accent` |
| `.dim-x` | 14px, muted (the "×" separator) |
| `.dim-unit` | 11px mono, muted |
| `.dim-area` | margin-left auto; 18px, weight 700, –0.02em |
| `.dim-area.empty` | muted, weight 400 (no dimensions entered yet) |
| `.shape-row` | flex gap 8px, margin-bottom 10px |
| `.chip` | 10px mono, 4px 10px padding, border, rounded 4px, muted, 0.04em |
| `.chip.active` | bg `--ink`, color `--bg` |
| `.chip.gold` | bg `--gold`, color white |
| `.note-input` | 13px, italic, transparent bg, border-bottom; focus shows border-bottom-color `--line-2` |
| `.remove-btn` | 10px mono, 5px 10px padding, transparent/muted; hover shows accent border+color |
| `.add-btn` | 11px mono, flex 1, 11px padding, dashed border, muted, transparent; hover shows `--surface-2` bg |

---

### Line Items Table — `.li-table`

Border 1px, radius `--r`, overflow hidden. Column grid: `2fr 1.1fr 1fr 1fr 1fr 40px`.

**Row types:**

| Class | Description |
|-------|-------------|
| `.li-head` | Header row, bg `--surface-2`, border-bottom |
| `.li-row` | Data row, border-bottom, cursor pointer; hover bg `--surface-2` |
| `.li-row.linked` | 3px left border `--sage` (room linked) |
| `.li-calc` | Calculation rows (tax, markup), bg `--surface-2`, border-top |
| `.li-total-row` | Total row; bg `--ink`, color `--bg`; dark: bg `--surface-2` + border-top |

**Row cells:**

| Class | Description |
|-------|-------------|
| `.li-name` | 14px, weight 500; transparent editable input; focus shows `--surface-2` bg |
| `.li-scope-cell` | 8px 12px padding |
| `.li-scope-btn` | 10px mono, 4px 10px padding, border, muted, rounded 4px; `.linked` variant: `--sage` border+color+bg |
| `.li-qty` | Transparent editable input, 14px, weight 500 |
| `.li-qty-linked` | Non-editable qty pulled from room (flex gap 5px) |
| `.li-qty-num` | 14px, weight 600, `--sage` |
| `.li-qty-unit` | 10px mono, sage, 0.8 opacity |
| `.li-rate` | Transparent editable input with `$` pseudo-element prefix |
| `.li-sub` | 14px, weight 600, –0.01em; `.has-val` turns `--accent` |
| `.li-x` | Delete button, muted; hover turns `--accent` |

**Tags row (`.li-tags`):** 7px 14px padding, bg `--surface-2`, border-top, flex gap 6px wrap.
- `.room-tag` — 10px mono, `--sage` border/color, bg rgba(sage, 0.06)
- `.waste-tag` — 10px mono, `--gold` border/color, bg rgba(gold, 0.06), margin-left 4px

**Calc rows:**
- `.li-calc-label` — 10px mono, muted, uppercase, grid-column 1/4
- `.li-pct` — 50px input, 13px, weight 600, border, rounded 4px, centered
- `.li-pct-suffix` — 10px mono, muted
- `.li-calc-amt` — 14px, weight 600

**Total row:**
- `.li-total-label` — 11px mono, uppercase, 0.04em, opacity 0.8, grid-column 1/5
- `.li-total-val` — 22px, weight 700, –0.025em

---

### Summary Box — `.summary`

bg `--ink`, color `--bg`, padding 20px 24px, radius `--r`, flex wrap, gap 14px. Dark: bg `--surface-2` + border 1px `--line` + 1px padding.

| Sub-element | Description |
|-------------|-------------|
| `.s-label` | 11px mono, muted, 0.04em, margin-bottom 4px; dark: muted |
| `.s-val` | 28px, weight 700, –0.025em |
| `.s-val.gold-c` | `--gold-l` color |
| `.waste-sel` | 11px mono select; dark bg, rgba white border; dark: ink color + line border |

---

### Calendar — `.cal`

Border 1px, radius `--r`, overflow hidden.

| Sub-element | Description |
|-------------|-------------|
| `.cal-nav` | flex gap 10px, 14px 18px padding, border-bottom, bg `--surface-2` |
| `.cal-title` | 15px, weight 600, –0.01em, flex 1 |
| `.cal-btn` | 11px mono, 6px 12px, border, bg `--surface`; `.today` variant in accent |
| `.cal-header` | Grid: `52px repeat(6,1fr)`, border-bottom |
| `.cal-day-head` | 8px 10px, centered, border-left; `.today` gets subtle accent bg |
| `.cal-day-name` | 9px mono, muted, uppercase, 0.06em |
| `.cal-day-num` | 18px, weight 600; `.today-num` in `--accent` |
| `.cal-body` | flex, height 680px, overflow-y auto |
| `.cal-time-col` | 52px wide, labels positioned absolutely |
| `.cal-hour-label` | 9px mono, muted |
| `.cal-days` | Grid `repeat(6,1fr)`, flex 1, position relative |
| `.cal-day-col` | border-left, position relative, min-height 680px; `.today` gets faint accent bg |
| `.cal-hour-line` | absolute border-top (solid) |
| `.cal-half-line` | absolute border-top dashed, 0.5 opacity |

**Events (`.cal-event`):** absolute positioned, 5px 7px padding, cursor pointer, radius 4px, border-left 3px, overflow hidden. Hover: brightness 1.05, z-index 10, shadow.

| Modifier | Background |
|----------|-----------|
| `.cal-event.visit` | `--gold` (white text) |
| `.cal-event.job` | `--accent` (white text) |
| `.cal-event.other` | `--sage` (white text) |

Sub-elements: `.cal-evt-title` (11px, weight 600, nowrap ellipsis), `.cal-evt-time` (9px mono, 0.85 opacity), `.cal-evt-crew` (9px mono, 0.75 opacity).

---

### Slide-in Panel — `.panel`

Position fixed (top/right/bottom 0), width 420px, bg `--surface`, border-left 1px, z-index 401. Closed: `transform: translateX(100%)`. Open (`.panel.open`): `translateX(0)`. Transition 0.25s ease.

Paired with `.overlay` (fixed inset 0, rgba(0,0,0,0.4), z-index 400, backdrop-filter blur 2px). Display none → block on `.overlay.open`.

| Sub-element | Description |
|-------------|-------------|
| `.p-head` | 20px 24px, border-bottom, bg `--surface-2` |
| `.p-title` | 20px, weight 700, –0.025em, margin-bottom 4px |
| `.p-sub` | 11px mono, muted |
| `.p-body` | flex 1, overflow-y auto, 20px 24px padding |
| `.p-foot` | 14px 24px padding, border-top, bg `--surface-2`, flex gap 8px |
| `.p-field` | margin-bottom 16px |
| `.p-label` | 10px mono, muted, uppercase, 0.06em, margin-bottom 5px |
| `.p-input` | 100% width, 14px, border 1px `--line`, bg `--surface`, 8px 10px, rounded 5px; focus border `--ink-2` |
| `.p-source` | 5-column grid for source tabs, bg `--line` (gap color), border, rounded 5px |
| `.p-source-tab` | 8px 4px, 9px mono, bg `--surface`, muted; `.active`: bg `--ink`, color `--bg` |
| `.evp-jump` | 11px mono, `--accent`, border-bottom transparent; hover shows border-bottom `--accent` |

**Panel instances:**

| Panel ID | Purpose |
|----------|---------|
| `#ncp-panel` | New Customer — name/contact/source form |
| `#evp-panel` | Event detail — schedule event editor |

---

### Mini-panel — `.mini-panel`

Position fixed, width 340px, bg `--surface`, border 1px, radius 8px, box-shadow 0 12px 40px, z-index 601. Display none → block on `.mini-panel.open`.

| Sub-element | Description |
|-------------|-------------|
| `.mp-head` | 12px 16px, bg `--surface-2`, border-bottom, flex space-between |
| `.mp-title` | 13px, weight 600 |
| `.mp-sub` | 10px mono, muted |
| `.mp-search` | 10px 14px, border-bottom; 11px mono input |
| `.mp-body` | 6px 0, max-height 280px, overflow-y auto |
| `.mp-row` | flex gap 10px, 9px 16px, cursor pointer, border-left 3px transparent; hover bg `--surface-2` |
| `.mp-row.checked` | sage bg + sage border-left (checkbox mode) |
| `.mp-row.radio.checked` | accent bg + accent border-left (radio mode) |
| `.mp-check` | 16×16px, border 1.5px `--line-2`, rounded 3px (circle for radio); checked: bg+border match type |
| `.mp-name` | 13px, weight 600, –0.01em |
| `.mp-mini-sub` | 10px mono, muted, margin-top 1px |
| `.mp-foot` | 10px 14px, bg `--surface-2`, border-top, flex gap 8px |
| `.mp-waste-row` | flex gap 8px, 10px 14px, bg `--surface-2`, border-top; contains waste% select |
| `.mp-preview` | 11px mono, 6px 14px 10px, `--sage`, bg `--surface-2` |

**Mini-panel instances:**

| Panel ID | Purpose |
|----------|---------|
| `#cp-panel` | Customer picker (checkbox list with search) |
| `#rp-panel` | Room picker (link line items to rooms; includes waste selector) |

---

### Customer Detail Card — `.cd-card`

bg `--surface`, border, radius `--r`, padding 24px, margin-bottom 14px.

| Sub-element | Description |
|-------------|-------------|
| `.cd-name-input` | 28px, weight 700, –0.025em editable input (no border, transparent bg) |
| `.cd-fields` | 3-column grid, gap 16px, margin-top 16px |
| `.cd-field-label` | 10px mono, muted, uppercase, 0.06em |
| `.cd-field-input` | 100% width, 13px, border-bottom `--line`, transparent bg; focus border-bottom `--ink-2` |

---

### Toast — `.toast`

Position fixed bottom 24px right 24px, bg `--ink`, color `--bg`, 14px 18px padding, radius 8px, 13px, z-index 999, max-width 340px. Display none → block on `.toast.show` with `slideUp` animation (0.3s ease).

| Sub-element | Description |
|-------------|-------------|
| `.toast-t` | Weight 600, –0.01em, margin-bottom 2px |
| `.toast-b` | 11px mono, 0.8 opacity |

Mobile: bottom 88px, full-width with 16px side margins.

---

### Bottom Navigation — `.bottom-nav`

Hidden by default. Shown at 880px breakpoint. Position fixed bottom 0, bg `--surface`, border-top, z-index 60, padding 6px 4px + `env(safe-area-inset-bottom)`.

`.bn-grid`: 5-column grid, max-width 520px, centered.

Each `.bn-btn`: flex column center, gap 3px, 7px 4px 5px padding, transparent bg, 11px mono, 9.5px, 0.04em, rounded 8px, min-height 50px. SVG icons: 22×22px, stroke currentColor, stroke-width 1.7, fill none, linecap/linejoin round.

Active state: `.bn-btn.active` → color `--accent`, stroke-width 2, plus `::before` pseudo-element (2px bar at top: 24px wide, bg `--accent`, radius 0 0 2px 2px).

**5 tabs (order):** Home · Customers · Estimates · Schedule · Quote

---

## 4. Utility Classes

| Class | Effect |
|-------|--------|
| `.light` | weight 400, `--muted` color |
| `.verm` | `--accent` color |
| `.sage` | `--sage` color |
| `.gold` | `--gold` color |
| `.up` | `--sage` (positive delta indicator) |
| `.down` | `--accent` (negative delta indicator) |
| `.paid` | `--sage` (payment received) |
| `.late` | `--accent` (overdue) |
| `.empty` | muted, weight 400 |
| `.gold-c` | `--gold-l` color |
| `.active` | Active state (nav tabs, filters, chips) |
| `.checked` | Selected state for mini-panel rows |
| `.open` | Visibility toggle for panels/overlays |
| `.row` | 2-column grid: `1.6fr 1fr`; collapses to `1fr` at 880px |
| `.actions` | flex, gap 8px, flex-wrap |
| `.eyebrow` | 11px mono, uppercase, 0.04em |
| `.sub` | 12px |

---

## 5. Responsive Behavior

### 880px breakpoint (tablet/mobile)

| Area | Change |
|------|--------|
| Navigation | Hide `.nav-tab`; reduce padding |
| Bottom nav | Show `.bottom-nav` (was display none) |
| Screens | Padding: 18px 14px 86px (bottom clears nav) |
| `.h1` | 36px → 28px |
| `.metrics` | 4 col → 2 col |
| `.row` | `1.6fr 1fr` → `1fr` (stack) |
| `.pipe` | 4 col → 2 col |
| `.t-cust` | 5 cols: hide columns 3+ → show name + est only |
| `.t-est` | 5 cols → 3 cols (num, name, area) |
| `.li-table` | 6 cols → 4 cols (hide scope, reduce qty) |
| `.panel` | 420px → 100vw |
| `.summary` | horizontal flex → vertical, 100% width |
| `.toast` | bottom 88px, left/right 16px (full width) |
| Calendar | Time col: 52px → 42px |

### 480px breakpoint (small mobile)

| Area | Change |
|------|--------|
| `.head` | flex-direction column, align-stretch |
| `.h1` | 28px → 24px |
| `.room` | padding 14px |
| `.dim-row` | flex-wrap (dimensions wrap) |
| `.dim-area` | margin-top 4px |

---

## 6. JS Functions

All called from inline `onclick` / `oninput` / `onchange` attributes. Implementations in `quiet-app.js`.

| Function | Trigger | Description |
|----------|---------|-------------|
| `showScreen(id)` | nav-tab / bn-btn click | Switch visible screen |
| `openNewCustomer()` | Button click | Open `#ncp-panel` + overlay |
| `closeNewCustomer()` | Panel close / overlay | Close NCP panel |
| `saveNewCustomer()` | NCP save button | Validate + save new customer |
| `selectSource(el)` | `.p-source-tab` click | Toggle active source tab |
| `openCpPicker()` | Estimates screen button | Open customer picker mini-panel |
| `closeCpPicker()` | Close button | Close CP panel |
| `renderCpList()` | CP search input | Filter + re-render customer list |
| `openRoomPicker()` | Line item scope button | Open room picker mini-panel |
| `closeRoomPicker()` | Close button | Close RP panel |
| `clearRoomLink()` | RP clear button | Remove room link from line item |
| `applyRoomLink()` | RP apply button | Apply room link + waste to line item |
| `updateRoomPickerPreview()` | RP row check/change | Update qty preview in RP footer |
| `openEventPanel(eventObj)` | Calendar event click | Open event editor panel |
| `closeEventPanel()` | Panel close | Close event panel |
| `selectEventType(el)` | Event type tab | Toggle visit/job/other |
| `onEvpCustomerChange()` | Customer input change | Update EVP customer context |
| `jumpToCustomerFromEvent()` | `.evp-jump` link | Navigate to customer detail |
| `jumpToEstimateFromEvent()` | `.evp-jump` link | Navigate to linked estimate |
| `deleteEvent()` | Delete button | Remove event, close panel |
| `saveEvent()` | Save button | Persist event data |
| `navigateWeek(dir)` | `.cal-btn` prev/next | Shift calendar week by ±1 |
| `setCustFilter(src, el)` | `.filter` click | Filter customer table by source |
| `openEstimateById(id)` | `.pipe-job` click | Open estimate from dashboard |
| `newEstimate()` | Dashboard button | Create new estimate |
| `newEstimateForCustomer()` | Customer detail button | Create estimate pre-linked to customer |
| `addEstRoom()` | Add room button | Append new `.room` block |
| `addEstNote()` | Add note button | Append note input to active room |
| `recalcEstimate()` | `.dim` input event | Recalculate room areas |
| `addLineItem()` | Add line button | Append new `.li-row` |
| `recalcQuote()` | Line item input event | Recalculate totals, subtotals, tax |
| `updateCustomerField(field, val)` | CD input change | Update customer record field |
| `backToList()` | Back button | Return to customer / estimate list |
| `backToEstimate()` | Back button | Return to estimate from quote |
| `viewActiveCustomer()` | Customer bar link | Open current customer detail |

---

## 7. Dark Mode Overrides

Toggle via `document.documentElement.setAttribute('data-theme', 'dark')`. Reverts to light on remove.

Notable component-level differences beyond token swaps:

| Component | Dark-specific change |
|-----------|---------------------|
| `.summary` | bg `--surface-2`, border 1px `--line`, padding +1px |
| `.li-scope-btn.linked` | bg `rgba(127,191,144,0.1)` (sage at 10%) |
| `.room-tag` | bg `rgba(127,191,144,0.08)` |
| `.waste-tag` | bg `rgba(224,176,74,0.08)` |
| `.li-total-row` | bg `--surface-2`, border-top added |
| `.cal-day-head.today` | bg `rgba(255,106,68,0.06)` |
| `.cal-day-col.today` | bg `rgba(255,106,68,0.04)` |
| `.mp-row.checked` | bg `rgba(127,191,144,0.08)` |
| `.mp-row.radio.checked` | bg `rgba(255,106,68,0.06)` |
| `.mini-panel` shadow | `rgba(0,0,0,0.5)` (darker) |
| `.waste-sel` | color `--ink`, border-color `--line` |
| `.s-label` | explicit `--muted` |

---

## 8. Animations

| Name | Usage | Keyframes |
|------|-------|-----------|
| `fade` | `.screen.active` — 0.25s ease | opacity 0 + translateY 4px → 1 + 0 |
| `slideUp` | `.toast.show` — 0.3s ease both | opacity 0 + translateY 10px → 1 + 0 |

Panel slide: CSS transition on `transform` (translateX 100% → 0), 0.25s ease.

Most interactive elements use `transition: [prop] 0.12s–0.15s` for hover/focus state changes.

---

## 9. External Dependencies

| Dependency | Version / Source | Used for |
|------------|-----------------|----------|
| Inter Tight | Google Fonts | Display / UI typeface |
| JetBrains Mono | Google Fonts | Mono / data typeface |
| Chart.js | 4.4.1 via cdnjs | Revenue chart on dashboard |
| `quiet-app.js` | Local (same dir) | All app logic and state |
