# SqFt app design system

The app shares one visual language with the marketing site (`www/`): Archivo
(variable, width + weight axes) for everything, JetBrains Mono for figures, a
neutral off-white / off-black base and one safety-orange accent. Tokens and
utilities live in `app/globals.css`; shared components in `components/ui/`.
When in doubt, copy the reference screens: `components/estimates/EstimateList.tsx`
(list page), `components/dashboard/*` (cards, stats, the tape meter) and
`app/(auth)/login/page.tsx` (forms).

## Tokens

Always reference tokens as `var(--x)` (e.g. `text-[var(--muted)]`). Never hard-code
hex values or `text-white` / `bg-black`.

| Token | Use |
| --- | --- |
| `--bg` | Page background. Also the fill of fields sitting inside cards. |
| `--surface` | Cards, panels, list containers. |
| `--surface-2` | Recessed fills: neutral badges, selected states, skeletons. |
| `--paper` | Things that float: dialogs, slide panels, menus, the public quote. |
| `--ink` / `--ink-2` / `--muted` | Primary text / secondary text / labels and meta. |
| `--line` / `--line-2` | Hairlines / stronger dividers and chip borders. |
| `--field-border` | The 3:1 edge every input gets. |
| `--hover` / `--press` | Translucent washes for hover / pressed rows and ghost buttons. |
| `--accent` | Safety orange **fills**: primary buttons, the brand mark, active indicators, the tape blade. Text on it is always `--on-accent` (dark). |
| `--accent-ink` | Orange **text**: links that need the accent, errors, overdue, destructive labels. |
| `--accent-wash` | 12% orange tint behind error / danger content. |
| `--ok` / `--warn` / `--bad` | Status text: approved/paid, pending (sent/viewed/partial), declined/overdue. `--bad` is `--accent-ink`. Tint fills with `color-mix(in_oklab,var(--ok)_14%,transparent)`. |
| `--shadow` / `--shadow-md` | Overlays only (menus, dialogs, panels, toasts). Cards never cast shadows. |
| `--scrim` | Backdrop behind dialogs and panels. |
| `--r` (6px) / `--r-in` (4px) | The one radius, and the nested radius for things inside a 6px control. |
| `--ease` | `cubic-bezier(.16,1,.3,1)`, the only easing curve. |

Legacy names (`--sage`, `--gold`, `--accent-l`, `--accent-d`, `--r-sm`, `--r-lg`)
still resolve but should not be used in new code: use `--ok`, `--warn`,
`--accent-hover`, `--accent-ink`, `--r-in`, `--r`.

Dark mode follows the OS by default; `ThemeToggle` stores an explicit choice and
sets `<html data-theme>`. Every token has a dark value, so styling with tokens is
dark-mode safe by construction.

## Type

- **Archivo** is the only text face. Body copy and controls run at normal width;
  display type is widened with `font-stretch`.
- **Mono (`type-figure`) is for figures only**: money, areas, quantities, rates,
  percentages, record numbers (`#5001`), times (`09:30`). Never for labels,
  buttons, headings or sentences.
- **No uppercase micro-labels.** Labels are sentence case (`Site measures`,
  not `SITE MEASURES`), 13px, `--muted`. The single `type-eyebrow` style exists
  but is rationed to at most one per screen; don't add new ones.
- Nothing smaller than 12px. Body/table text 14 to 15px, labels and meta 13px.

| Utility | Use |
| --- | --- |
| `type-title` | Page titles. Use `<PageHeader>` rather than applying it by hand. |
| `type-display` | Other wide display text: dialog titles, big public-page headings. Set size alongside. |
| `type-heading` | Card and section headings (17px, slightly wide). |
| `type-label` | Field, column and stat labels. |
| `type-figure` | Mono + tabular numerals for figures. |
| `type-stat` | Big figures (KPIs, totals). Set size alongside. |

## Shape and surfaces

- Every rounded thing uses `rounded-[var(--r)]` (6px); things nested inside a
  6px control use `rounded-[var(--r-in)]`. `rounded-full` only for avatars and
  circular spinners. (Tailwind's `rounded-*` scale is mapped to the same 6px.)
- Cards: the `card` class (or `<Card>`): surface, 1px `--line` border, 6px, no
  shadow. Group content with spacing and hairlines before reaching for nested
  cards. Never put a card inside a card.
- Overlays (`Modal`, `SlidePanel`, menus, toasts) use `--paper` + `--shadow-md`.

## Components (`components/ui/`)

| Component | Notes |
| --- | --- |
| `Button`, `buttonClasses()` | Variants: `primary` (orange, dark text: **one main action per view**), `default` (outline, most actions), `ink` (solid off-black, a strong secondary), `ghost` (tertiary, icon buttons), `danger` (outline in `--accent-ink`, destructive). Sizes `sm` 34px, `md` 40px, `lg` 48px, plus square `icon` (40px) and `icon-sm` (34px) for icon-only buttons (always with an `aria-label`). SVG icons inside are auto-sized; don't override them. Use `buttonClasses()` for links that look like buttons. |
| `icons.ts` | Phosphor icons (regular weight; `fill` for active nav, `bold` inside badges). Import from `@/components/ui/icons`, never hand-draw SVGs or use text glyphs (`→ ✓ ✕ ▾ ☾`) as icons. Decorative icons get `aria-hidden="true"`; icon-only buttons get `aria-label`. |
| `PageHeader`, `BackLink`, `MetaSep` | Title + optional `kicker` (back link / date), `meta` line and `actions`. `MetaSep` hides itself on phones, where meta lines wrap. |
| `Breadcrumbs`, `recordTrail` | The record trail in a detail page's `kicker` (Customers → customer → site measure → estimate). Ancestors only; phones collapse it to a back link to the nearest parent. |
| `Card`, `CardLink` | Flat card with optional `title`, `sub`, `action`; `flush` for edge-to-edge lists. `CardLink` is the "View all →" link. |
| `Stat` | Label + mono figure + optional sub line. The figure inherits its colour, so `valueClassName` can tint it. |
| `TapeMeter` | Progress as the marketing site's tape-measure blade, with an optional pace/target marker. Use it for progress toward a total (revenue goal, amount billed), not for decoration. |
| `StatusBadge`, `Tag`, `statusMeta`, `TONE_CLASSES`, `TONE_TEXT` | Every estimate/invoice status renders through `StatusBadge` (tone + icon + label). `Tag` is the same pill for non-status labels. |
| `SourceBadge`, `CrewAvatar` | Neutral source tag; ink-circle initial avatar. |
| `ListToolbar`, `SearchInput`, `FilterPill`, `DensityToggle` | List page toolbar. On phones the chips scroll sideways. |
| `table.ts` | Class recipes for grid lists: `TABLE_SHELL`, `TABLE_HEAD`, `TABLE_HEAD_CELL`, `TABLE_ROW`, `CELL`, `CELL_PRIMARY`, `CELL_SUB`, `CELL_FIGURE`, `CELL_META`. Numeric columns right-align. |
| `SortableHeader`, `Pagination` | Sortable column header; paginator with the tape ruler. |
| `EmptyState`, `LoadingRows`, `LoadingLine`, `ErrorState` | Every list/card has loading, empty and error states. `LoadingRows`/`LoadingLine` keep a screen-reader "Loading…" string (e2e waits on it). |
| `Modal`, `SlidePanel`, `Toast` | Dialog (bottom sheet on phones), right-hand panel, toast. |
| `ThemeToggle`, `BrandMark` | System/light/dark segmented control; the orange-square + wordmark lockup. |

### CSS classes (`app/globals.css`, components layer)

- `field` on every text `input`, `select` and `textarea` (40px, 16px text on
  phones so iOS doesn't zoom, `--field-border`, orange focus ring, invalid via
  `aria-invalid`). Fields inside cards stay on the default `--bg` fill; add
  `bg-[var(--surface)]` for fields placed directly on the page background.
  Dense grids (the estimate builder) may shrink with `min-h-[34px] h-[34px] px-2.5`.
- `field-label` above a field (never placeholder-as-label), `field-hint` and
  `field-error` below it.
- `seg` for segmented controls: children with `aria-pressed="true"` (or
  `aria-checked` / `aria-selected` / `data-active`) get the ink thumb.
- `tape-blade` for the orange blade itself (used by `TapeMeter` and `Pagination`).
- `no-scrollbar` for horizontal scrollers.

## Copy and content rules

- Keep existing labels, placeholders and accessible names: e2e and unit tests
  select by them. Restyling never changes what a control says.
- No em dashes (`—`) or en dashes (`–`) in UI-authored strings; use a hyphen,
  comma, colon or a new sentence. Empty values render `-`.
- No decorative dots, no section numbers (`01`, `02`) as labels, no fake data
  (static sparkbars, placeholder columns that never fill).

## Motion

Motion is feedback, not decoration: press (`active:scale-[0.98]`), hover shifts
on arrows, overlays sliding in with `--ease`, the tape blade pulling out once.
Animate `transform` and `opacity` only. `prefers-reduced-motion` collapses all
of it globally.

## Z-index scale

Sticky app chrome 60, menus 300, slide panels 400/401, modals 500, toasts 900.
