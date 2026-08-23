import Link from 'next/link';
import type { ReactNode } from 'react';
import { initials, formatRelativeTime } from '@snoopy/shared';

export function StatCard({
  label, value, hint, href,
}: { label: string; value: ReactNode; hint?: string; href?: string }) {
  const body = (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const TONE: Record<string, string> = {
  Completed: 'badge-ok',
  'In Progress': 'badge-info',
  Pending: 'badge',
  Overdue: 'badge-danger',
  Archived: 'badge',
  'Not Started': 'badge',
  High: 'badge-danger',
  Medium: 'badge-warn',
  Low: 'badge',
  admin: 'badge-info',
  employee: 'badge',
  Going: 'badge-ok',
  Maybe: 'badge-warn',
  Declined: 'badge',
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="subtle">—</span>;
  return <span className={`badge ${TONE[status] ?? ''}`}>{status}</span>;
}

export function ProgressBar({ value, showValue = true }: { value: number | null; showValue?: boolean }) {
  if (value === null || value === undefined) {
    return <span className="subtle">—</span>;
  }
  const tone = value >= 80 ? 'ok' : value >= 50 ? '' : 'warn';
  return (
    <div className="progress-row">
      <div
        className={`progress ${tone}`}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      {showValue ? <span className="value">{value}%</span> : null}
    </div>
  );
}

export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return <span className={`avatar${large ? ' lg' : ''}`} aria-hidden>{initials(name)}</span>;
}

export function Person({ name, meta, href }: { name: string; meta?: string | null; href?: string }) {
  const inner = (
    <span className="person">
      <Avatar name={name} />
      <span>
        <span style={{ fontWeight: 560 }}>{name}</span>
        {meta ? <span className="meta" style={{ display: 'block' }}>{meta}</span> : null}
      </span>
    </span>
  );
  return href ? <Link href={href} className="link">{inner}</Link> : inner;
}

function EmptyMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden
         style={{ color: 'var(--ink-subtle)' }}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M3 9.5h18M8.5 4.5v15" />
    </svg>
  );
}

export function EmptyState({ title, message }: { title?: string; message: string }) {
  return (
    <div className="empty">
      <EmptyMark />
      {title ? <h3>{title}</h3> : null}
      <p>{message}</p>
    </div>
  );
}

export function Card({
  title, action, children, tight = false,
}: { title?: string; action?: ReactNode; children: ReactNode; tight?: boolean }) {
  return (
    <section className="card">
      {title || action ? (
        <div className="card-head">
          <h2>{title}</h2>
          {action}
        </div>
      ) : null}
      <div className={`card-body${tight ? ' tight' : ''}`}>{children}</div>
    </section>
  );
}

export function TableCard({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {title || action ? (
        <div className="card-head">
          <h2>{title}</h2>
          {action}
        </div>
      ) : null}
      <div className="table-wrap">{children}</div>
    </section>
  );
}

export function PageHead({
  title, subtitle, actions,
}: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
  );
}

export function Tabs({ tabs, current }: { tabs: { href: string; label: string }[]; current: string }) {
  return (
    <nav className="tabs">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className="tab" aria-current={t.href === current ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function BarChart({ rows }: { rows: { label: string; value: number; href?: string }[] }) {
  if (rows.length === 0) return <EmptyState message="Not enough data to chart yet." />;
  return (
    <div className="bar-chart">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {r.href ? <Link href={r.href} className="link">{r.label}</Link> : r.label}
          </span>
          <div className="progress"><span style={{ width: `${Math.min(100, r.value)}%` }} /></div>
          <span className="num" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.value}%</span>
        </div>
      ))}
    </div>
  );
}

/**
 * When a decision was recorded, and by whom.
 *
 * Shown wherever a status is shown. A record that says "Checked" without saying
 * when is halfway to useless: the first question asked of any approval is what
 * was known at the time, and that cannot be answered from a badge.
 *
 * The exact moment sits in the tooltip; the relative form is what somebody
 * actually reads at a glance.
 */
export function ApprovedStamp({
  at, by, verb = 'Checked',
}: { at: string | null | undefined; by?: string | null; verb?: string }) {
  if (!at) return null;
  const when = new Date(at);
  return (
    <span className="stamp" title={when.toLocaleString()}>
      {verb} {formatRelativeTime(at)}
      {by ? ` by ${by}` : ''}
    </span>
  );
}
