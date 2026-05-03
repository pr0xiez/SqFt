# SqFt — Design System

**SqFt** is a compact estimate-and-job book for small flooring contractors. Owner-operator software for someone who's measuring rooms with a tape on Tuesday and chasing an unpaid invoice on Friday — not an enterprise CRM. The design has to feel **calm and serious**, like a well-kept ledger, while the numbers and money still pop.

This system codifies the **Quiet Modern** direction we shipped: warm paper neutrals, an editorial display/mono pairing, a single confident vermilion accent, and supporting sage/gold semantics for paid/warning states.

---

## What's in here

| File / folder | What it is |
|---|---|
| `README.md` | This file — context, content rules, visual foundations, iconography |
| `colors_and_type.css` | All design tokens (CSS vars) — colors, type, spacing, radii, motion |
| `SKILL.md` | Skill manifest (for use as a Claude Code skill) |
| `preview/` | Card specimens that populate the Design System tab |
| `ui_kits/sqft-app/` | High-fidelity React components for the SqFt web app |
| `SqFt - Quiet.html` | Reference: full Quiet Modern app (source of truth) |
| `SqFt - Login.html` | Reference: sign-in screen in the same vocabulary |
| `SqFt - Polished.html`, `SqFt - Variations.html` | Earlier explorations — kept for reference |
| `quiet-app.js` | App logic for the reference Quiet build |

Sources: this system was extracted from the in-project Quiet Modern build (`SqFt - Quiet.html` / `quiet-app.js`) — there is no external Figma or codebase. Future iterations should treat the Quiet build as ground truth.

---

## Product context

**Who uses it.** Mike, a single-truck flooring contractor, plus 1–2 office staff who handle scheduling and invoicing. They're on a desktop in the office and a phone at the jobsite. They are not designers; they want their numbers to look right and their schedule to be obvious.

**What's in it.**
- Dashboard — metrics, alerts, pipeline, today's schedule
- Customers — sourced lead list with detail pages
- Estimates — site-measure builder (rooms → square footage → waste-adjusted order qty)
- Quote Builder — line items linked to rooms, with tax + markup
- Schedule — week calendar with crew assignments

**The voice.** Trade-shop direct. Specific over generic. Numbers are the content.

---

## Content fundamentals

**Tone.** Plainspoken, owner-operator. We're a tool, not a coach. Think *clipboard, not chatbot*.

**Casing.**
- **Sentence case** for everything except short mono labels.
- Mono labels (`eyebrow`, table headers, field labels) are **UPPERCASE** with letter-spacing.
- Buttons use sentence case (`Send to customer`, not `SEND TO CUSTOMER`) — except the Sign-in button which is the one place we use uppercase mono for emphasis.
- Section eyebrows are sentence case with one descriptor: *"Friday, 2 May 2025"*, *"SqFt · Flooring Estimates"*.

**Pronouns.** Avoid both. The product addresses the user by *doing the work*, not by saying "you" or "we". When a name is needed, use the user's first name (*"Good Morning, Mike"*).

**Punctuation.**
- Em-dash and middle-dot (·) are the connective tissue. *"Carlos · 142 Maple Dr"*, *"Day 2/3 · Carlos"*, *"Williams Bath · Day 1"*.
- Slashes for short fractions (*"Day 2/3"*).
- No exclamation points. Ever.
- Currency is always written `$3,840` — never `USD 3840` or `3.84k`. Cents only when meaningful (`$3,017.50` in the quote total; `$5,600` in the pipeline).

**Numbers and units.**
- Square footage uses the abbreviation `sf` after a space: `184 sf`, `2,200 sf`.
- Linear footage `lf`, square yards `sy`, each `ea`.
- Percentages with a `%` sign and no space: `+10%`, `7.5%`.
- Dimensions use `×`: `12 × 14 ft`.

**Vocabulary.**
- It's an **estimate** when the contractor is measuring; it becomes a **quote** when sent to the customer. Both screens exist.
- **Crew**, not "team". **Job**, not "project". **Lead**, not "prospect".
- **Waste** is the percentage added to gross sf for cuts and breakage. Always shown explicitly (`+10%`).

**Examples that capture the voice.**
- > "7 active jobs · 3 quotes pending · 2 crews in field"
- > "Henderson invoice — $3,840 — is 14 days overdue"
- > "Kowalski quote expires in 2 days — no response yet"
- > "Day 2/3 · Carlos"
- > "+10% waste · 202 sf to order"

**Emoji.** Never. Use SVG iconography for everything, including states. The one allowed unicode use is the moon/sun glyph in the theme toggle (`☾` / `☀`).

---

## Visual foundations

### Background and surfaces
Warm off-white **paper** (`--bg #fafaf7`), pure white card `surface`, and a slightly cool tan `surface-2` for table headers, hover, and nested rows. **No full-bleed images, no gradients, no textures.** The page itself is the canvas — quiet.

Dark mode is true neutral charcoal (`#0f0f0d` page, `#181815` card) — never blue-black.

### Color
- **Vermilion `--accent #c0341a`** is the only "loud" hue, and it's used sparingly: the wordmark's *Sq*, primary money values, the active-tab underline, dimension input text, the danger alert, accent buttons.
- **Sage `#3d6b4a`** = positive (paid, linked-to-room, on-time).
- **Gold `#b07a1a`** = warning, waste-tag, pipeline value.
- Everything else is ink and paper. Black-on-cream and ink-on-paper are the workhorse pairings; the colored hues are signals, not decoration.

### Typography
**Two families, used with intent.**
- **Inter Tight** for display, body, buttons, names of things — *the editorial voice.* Tight tracking on display sizes (`-.025em`), snug on UI (`-.01em`).
- **JetBrains Mono** for labels, eyebrows, data, table headers, badges, button text in some places — *the receipt voice.* Used at small sizes (10–12px) with positive tracking (`+.04em` to `+.06em` uppercase).

**The pairing is the system.** Display Inter Tight at 36px next to a 11px uppercase mono eyebrow is the canonical SqFt page header. Card titles are 14–15px Inter Tight 600; the sub-line is mono. Numbers in metrics are 28px Inter Tight 700.

Never use other display weights. Stick to: Inter Tight 400 / 500 / 600 / 700 / 800; JetBrains Mono 400 / 500 / 600.

### Spacing
4px base. Section gutters are 24–32px; card padding is 18–20px; row padding is 11–14px. Density is high — like a printed ledger — but never cramped.

### Borders and lines
**Hairlines do most of the heavy lifting.** Solid 1px `--line` between rows, around cards, between table cells (no zebra stripes). Dashed `--line-2` only for "+ Add Room" / "+ Add Note" affordances. **No drop shadows under cards by default** — borders are enough. Shadows appear only on (a) panels, (b) hovered alerts, (c) the toast.

Accent left-borders (3px, colored) signal a *category* of row: red for danger alerts, sage for room-linked line items, source-color for customer rows. Reserve this pattern; don't sprinkle it.

### Corner radii
- `4–5px` — chips, badges, tiny buttons, calendar events.
- `6px` — buttons, inputs, line-item cells.
- `8px` — cards, panels, the metric strip, the quote summary block.
- Nothing is fully circular except avatars and bullet dots.

### Shadows
Two stops only — `--shadow` (resting) and `--shadow-md` (panels, toasts). Both are **warm** (rgba(20,18,12,*)), never neutral black. They are very subtle by default and meant to be felt, not seen.

### Hover & press
- Buttons: border darkens to `--ink-2`, background shifts to `--surface-2`.
- Rows: background to `--surface-2`. List items in the daily schedule slide right by 6px on hover (`padding-left: 6px`) — a small "tug" cue.
- Pipe job cards: `translateY(-1px)` and a stronger border.
- Filters/chips when active flip to `background: --ink; color: --bg` — the inversion is the active state.
- Press: `transform: translateY(1px)` on the sign-in button only; everything else holds steady.

### Motion
**Quiet and short.** All transitions are 120–250ms with `ease`/`cubic-bezier(.4,0,.2,1)`. No bouncing, no springs, no parallax. Two named keyframes:
- `fade` (0.25s) — screen-to-screen.
- `slideUp` (0.3s) — toast in.
- `slideDown` (0.2s) — error reveal.

Bottom-nav active tabs get a 2px vermilion bar above them; the bar doesn't animate.

### Layout rules
- **Max width 1200px**, centered, 32px gutters on desktop. The app is a *document*.
- **Sticky 60px top nav**, never collapses on desktop.
- **Bottom nav appears under 880px** (5 tabs, no FAB) — replaces top tabs, top nav stays for brand + theme.
- The `head` block (eyebrow → h1 → sub) is the page header pattern. It always sits left, with `actions` flush right.

### Cards
- 1px border, no resting shadow.
- 8px radius.
- 18–20px internal padding.
- A `card-h` row at top: 14–15px title left, 11px mono sub-label right.
- Variations: a 3px left-border accent for **categorized** cards (the customer bar, danger alerts, room-linked items).

### Transparency / blur
Used **only** for the panel overlay (`rgba(0,0,0,.4)` + `backdrop-filter: blur(2px)`). No frosted-glass surfaces elsewhere.

### Imagery
There is currently **no decorative imagery**. If product photos are added later (e.g. material thumbnails), they should be cropped tight, b&w-or-warm-tinted, never cool/blue.

---

## Iconography

**No icon library is installed.** The SqFt build uses three tactics, in this order of preference:

1. **Hand-drawn inline SVG**, monoline, 22×22 viewBox, `stroke-width: 1.7`, `stroke-linecap: round`, `stroke-linejoin: round`. This is the canonical SqFt icon style — used in the bottom navigation. Active state bumps `stroke-width` to `2`.
2. **Mono-text glyphs** for arrows and connectors (`→`, `←`, `↑`, `↓`, `·`, `—`, `×`). Used in buttons and copy.
3. **Single Unicode glyphs** for the theme toggle (`☾` light → dark, `☀` dark → light). The only place Unicode-as-icon is allowed.

**No emoji.** No colored Material/HeroIcons. No multi-color glyph fonts.

If we need more icons, **add them as inline SVGs in the same monoline style** (1.7 stroke, rounded caps/joins, 22×22) — see `preview/icons.html` for the canonical set we already use (Home, Customer, Estimate, Calendar, Quote).

A small set of accent glyphs do appear:
- `+` for add buttons.
- `✓` checkmark inside the room-picker checkbox (renders white-on-sage).
- `✕` close on panels.

---

## Quick start

```html
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="colors_and_type.css">

<div class="screen">
  <div class="head">
    <div>
      <div class="eyebrow">Friday, 2 May 2025</div>
      <h1>Good Morning, <span style="font-weight:400;color:var(--ink-2)">Mike</span></h1>
      <div class="sub">7 active jobs · 3 quotes pending</div>
    </div>
  </div>
</div>
```

That gives you the canonical SqFt page header. Lean on the tokens, don't invent new ones.

---

## Caveats

- **Fonts are CDN-only.** No `.woff2` is checked in. If you need offline export, host Inter Tight + JetBrains Mono yourself.
- **No real iconography library.** The 5 nav icons are the entire vocabulary so far; add SVGs in the same style as you go.
- **Dark mode is a contract, not a styling choice.** Every new component must work in both `[data-theme="dark"]` and the default. Test both.
- **No illustrations or imagery yet.** If brand expansion needs a logo lockup beyond the wordmark, design it in keeping with the wordmark — italic *Sq* in vermilion, upright **Ft** in ink.
