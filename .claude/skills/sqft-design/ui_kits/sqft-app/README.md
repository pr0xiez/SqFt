# SqFt App · UI Kit

Pixel-faithful React recreation of the SqFt web app's Quiet Modern direction. Components map 1:1 to the pieces used in `SqFt - Quiet.html`.

## Files
- `index.html` — interactive demo (dashboard)
- `sqft.css` — design tokens + component classes (mirror of root `colors_and_type.css` plus component CSS)
- `components.jsx` — JSX components

## Components
| Component | What it is |
|---|---|
| `TopNav` | Sticky 60px nav with brand, tabs, theme toggle, avatar |
| `PageHeader` | Canonical eyebrow → h1 → sub + actions |
| `Button` | `default · primary · accent · ghost` variants |
| `Alert` / `AlertStack` | 3px-left-border alerts (danger / warn) |
| `Metric` / `MetricStrip` | 4-up metric strip with sage / vermilion / gold tones |
| `Card` | Hairline-bordered card with `card-h` title row |
| `ListRow` | Time + dot + name + sub + tag — schedule items |
| `Badge` | Source badges (phone, online, referral, walkin, website) |
| `SummaryBar` | Ink-on-bg totals row used in estimates / quotes |
| `Pipeline` / `PipelineColumn` | 4-column job pipeline |

## Usage

```jsx
<TopNav tabs={['Dashboard','Customers','Estimates','Schedule']}
        active="Dashboard" onChange={setActive}
        theme={theme} onToggleTheme={toggle} />

<main className="screen">
  <PageHeader
    eyebrow="Friday, 2 May 2025"
    title="Good Morning," light="Mike"
    sub="7 active jobs · 3 quotes pending"
    actions={<><Button>+ New Customer</Button>
               <Button variant="primary">+ New Estimate</Button></>}
  />
  …
</main>
```

## Notes
- All components use the CSS variables from `sqft.css`. Toggle dark mode by setting `data-theme="dark"` on `<html>`.
- This kit covers the dashboard pattern. Estimate builder, quote builder, customer detail, and schedule live in the reference app (`SqFt - Quiet.html`) — port them into this kit as needed.
