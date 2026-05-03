// SqFt UI kit components — quiet modern direction.
// Each component is a thin wrapper around the canonical CSS classes
// in sqft.css; styling lives in CSS, structure lives here.

const { useState } = React;

// ── TopNav ─────────────────────────────────────────────────────
function TopNav({ tabs = [], active, onChange, theme = 'light', onToggleTheme, user = 'MJ' }) {
  return (
    <nav className="nav">
      <div className="brand"><em>Sq</em>Ft</div>
      {tabs.map(t => (
        <button
          key={t}
          className={`nav-tab${t === active ? ' active' : ''}`}
          onClick={() => onChange?.(t)}
        >{t}</button>
      ))}
      <div className="nav-r">
        <button className="theme-toggle" onClick={onToggleTheme} title="Toggle theme">
          <span>{theme === 'dark' ? '☀' : '☾'}</span>
          <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
        </button>
        <div className="avatar">{user}</div>
      </div>
    </nav>
  );
}

// ── PageHeader ─────────────────────────────────────────────────
// Canonical eyebrow → h1 → sub block, with right-aligned actions.
function PageHeader({ eyebrow, title, light, sub, actions }) {
  return (
    <div className="head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <div className="h1">
          {title}
          {light && <> <span className="light">{light}</span></>}
        </div>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

// ── Button ─────────────────────────────────────────────────────
function Button({ variant = 'default', children, ...rest }) {
  const cls =
    variant === 'primary' ? 'btn btn-primary'
    : variant === 'accent' ? 'btn btn-accent'
    : variant === 'ghost' ? 'btn btn-ghost'
    : 'btn';
  return <button className={cls} {...rest}>{children}</button>;
}

// ── Alert ──────────────────────────────────────────────────────
function Alert({ tone = 'danger', children, cta, onClick }) {
  return (
    <div className={`alert ${tone}`} onClick={onClick}>
      <span className="alert-body">{children}</span>
      {cta && <span className="alert-cta">{cta}</span>}
    </div>
  );
}
function AlertStack({ children }) { return <div className="alerts">{children}</div>; }

// ── Metric strip ──────────────────────────────────────────────
function Metric({ label, value, tone, sub, subTone }) {
  const valCls = tone ? `m-val ${tone}` : 'm-val';
  const subCls = subTone ? `m-sub ${subTone}` : 'm-sub';
  return (
    <div className="metric">
      <div className="m-label">{label}</div>
      <div className={valCls}>{value}</div>
      {sub && <div className={subCls}>{sub}</div>}
    </div>
  );
}
function MetricStrip({ children }) { return <div className="metrics">{children}</div>; }

// ── Card ───────────────────────────────────────────────────────
function Card({ title, sub, action, children, style }) {
  return (
    <div className="card" style={style}>
      {(title || action) && (
        <div className="card-h">
          <div className="card-t">{title}</div>
          {sub ? <div className="card-s">{sub}</div> : action}
        </div>
      )}
      {children}
    </div>
  );
}

// ── Schedule list row ─────────────────────────────────────────
function ListRow({ time, dotColor = 'var(--gold)', name, sub, tag, onClick }) {
  return (
    <div className="lrow" onClick={onClick}>
      {time && <div className="lr-time">{time}</div>}
      <div className="dot" style={{ background: dotColor }}></div>
      <div style={{ flex: 1 }}>
        <div className="lr-name">{name}</div>
        {sub && <div className="lr-sub">{sub}</div>}
      </div>
      {tag && <div className="lr-tag">{tag}</div>}
    </div>
  );
}

// ── Badge ──────────────────────────────────────────────────────
function Badge({ tone, children }) {
  const colorMap = {
    phone: 'var(--sage)', online: 'var(--gold)', referral: 'var(--accent)',
    walkin: 'var(--muted)', website: 'var(--ink-2)',
  };
  return (
    <span className="badge" style={{ color: colorMap[tone] || 'var(--muted)' }}>
      {children}
    </span>
  );
}

// ── Summary bar (totals) ──────────────────────────────────────
function SummaryBar({ items, trailing }) {
  return (
    <div className="summary">
      {items.map((it, i) => (
        <div key={i}>
          <div className="s-label">{it.label}</div>
          <div className={`s-val${it.tone === 'gold' ? ' gold-c' : ''}`}>{it.value}</div>
        </div>
      ))}
      {trailing}
    </div>
  );
}

// ── Pipeline column ───────────────────────────────────────────
function PipelineColumn({ heading, jobs }) {
  return (
    <div>
      <div className="pipe-h">{heading}</div>
      {jobs.map((j, i) => (
        <div className="pipe-job" key={i} onClick={j.onClick}>
          <div className="pj-name">{j.name}</div>
          <div className="pj-sub" style={j.subColor ? { color: j.subColor } : null}>{j.sub}</div>
          <div className={`pj-amt${j.amtTone ? ' ' + j.amtTone : ''}`}>{j.amount}</div>
        </div>
      ))}
    </div>
  );
}
function Pipeline({ children }) { return <div className="pipe">{children}</div>; }

// expose to other Babel scripts
Object.assign(window, {
  TopNav, PageHeader, Button, Alert, AlertStack,
  Metric, MetricStrip, Card, ListRow, Badge,
  SummaryBar, Pipeline, PipelineColumn,
});
