'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { WorklistItem } from '@snoopy/shared';
import {
  reviewCredentialsAction, reviewDocumentRequestsAction, verifyAssignmentsAction,
} from '@/lib/actions';
import { Field, Overlay, useAction } from './Interactive';
import { Card, Person } from './ui';

/**
 * One group of the queue, cleared in batches.
 *
 * Three of the six groups end in the same verdict for every row — accepted —
 * and those are the ones that arrive in clumps: a group session finishes, a
 * checklist goes out to a whole team, thirty certificates land in a week. One
 * button per row is fine for three rows and hopeless for thirty.
 *
 * Rejection stays per-row on purpose. Sending something back needs a reason,
 * and a reason shared by thirty records is not a reason.
 */
const BULK: Partial<Record<WorklistItem['kind'], { verb: string; needsMethod?: boolean }>> = {
  credential: { verb: 'Accept', needsMethod: true },
  document: { verb: 'Accept' },
  verification: { verb: 'Confirm' },
};

const METHODS = [
  'Original sighted',
  'Checked against the issuing register',
  'Copy or photograph only',
];

export function WorklistGroup({
  kind, title, blurb, rows, canClear,
}: {
  kind: WorklistItem['kind'];
  title: string;
  blurb: string;
  rows: WorklistItem[];
  /** Whether this person may clear this kind, not merely see it. */
  canClear: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [asking, setAsking] = useState(false);
  const [method, setMethod] = useState('');
  const { busy, error, call } = useAction();

  const bulk = canClear ? BULK[kind] : undefined;
  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id); else next.delete(id);
      return next;
    });

  const clear = () => {
    const ids = [...selected];
    const done = () => setSelected(new Set());
    const confirmation = `${ids.length} cleared.`;

    if (kind === 'credential') {
      return call(() => reviewCredentialsAction(ids, method, method === METHODS[0]),
        () => { done(); setAsking(false); }, { confirmation });
    }
    if (kind === 'document') {
      return call(() => reviewDocumentRequestsAction(ids), done, { confirmation });
    }
    return call(() => verifyAssignmentsAction(ids), done, { confirmation });
  };

  return (
    <Card
      title={title}
      action={(
        <div className="row" style={{ gap: 12 }}>
          <span className="count-badge">{rows.length}</span>
          {bulk ? (
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn btn-sm"
                onClick={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
              >
                {allSelected ? 'Clear' : 'Select all'}
              </button>
              <button
                className="btn btn-sm btn-primary"
                disabled={busy || selected.size === 0} aria-busy={busy}
                onClick={() => (bulk.needsMethod ? setAsking(true) : clear())}
              >
                {busy ? 'Working…' : `${bulk.verb} ${selected.size || ''}`.trim()}
              </button>
            </div>
          ) : null}
        </div>
      )}
      tight
    >
      <p className="worklist-blurb">{blurb}</p>
      {error ? <div className="alert" role="alert" style={{ margin: '0 0 14px' }}>{error}</div> : null}

      {/*
       * A queue, not a data grid: no header row, no cell borders — one to
       * five items don't need column labels to stay legible, and the labels
       * were the loudest thing on a page whose only job is "here's what's
       * waiting, go open it".
       */}
      <div className="worklist-rows">
        {rows.map((item) => (
          <div className="worklist-row" key={`${item.kind}-${item.id}`}>
            {bulk ? (
              <input
                type="checkbox" className="checkbox"
                checked={selected.has(item.id)}
                onChange={(e) => toggle(item.id, e.target.checked)}
                aria-label={`Select ${item.person}, ${item.what}`}
              />
            ) : null}
            <Person name={item.person} href={`/employees/${item.personId}`} />
            <div className="worklist-row-what">
              <span style={{ fontWeight: 560 }}>{item.what}</span>
              <div className="subtle">{item.detail}</div>
            </div>
            <Waiting item={item} />
            <Link className="btn btn-sm" href={item.href}>Open</Link>
          </div>
        ))}
      </div>

      {asking ? (
        <Overlay
          title={`Accept ${selected.size} ${selected.size === 1 ? 'certificate' : 'certificates'}`}
          onClose={() => setAsking(false)}
          footer={
            <>
              <button className="btn" onClick={() => setAsking(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || !method} aria-busy={busy} onClick={clear}>
                {busy ? 'Accepting…' : 'Accept'}
              </button>
            </>
          }
        >
          <Field
            label="How did you check these?"
            hint="Recorded against every record in the batch. Accepting without saying how you checked is what makes a record impossible to stand behind later."
          >
            <select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">Choose…</option>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <p className="subtle">
            Only accept in a batch when you checked them the same way. Anything
            that needs sending back is best done one at a time, with a reason.
          </p>
        </Overlay>
      ) : null}
    </Card>
  );
}

/**
 * How long this has been sitting there, or how long is left.
 *
 * A negative age is time remaining rather than time elapsed, which reads very
 * differently: one is a debt, the other a deadline.
 */
function Waiting({ item }: { item: WorklistItem }) {
  if (item.age === null) return <span className="subtle">—</span>;

  if (item.age < 0) {
    const left = Math.abs(item.age);
    return <span className="req req-due_soon">{left} {left === 1 ? 'day' : 'days'} left</span>;
  }

  const tone = item.blocking || item.age > 7 ? 'overdue' : 'due_soon';
  if (item.age === 0) return <span className={`req req-${tone}`}>today</span>;
  return <span className={`req req-${tone}`}>{item.age} {item.age === 1 ? 'day' : 'days'}</span>;
}
