'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDate, type AwaitingVerification } from '@snoopy/shared';
import { verifyAssignmentsAction } from '@/lib/actions';
import { useAction } from './Interactive';
import { EmptyState, Person, TableCard } from './ui';

/**
 * The verification queue, cleared in batches.
 *
 * One button per row is fine for three rows and hopeless after a group session,
 * where thirty people finish the same course on the same afternoon. Selecting a
 * course heading takes the whole group, because that is how the work actually
 * arrives.
 */
export function VerificationQueue({ rows }: { rows: AwaitingVerification[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { busy, error, call } = useAction();

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id); else next.delete(id);
      return next;
    });

  const allSelected = rows.length > 0 && selected.size === rows.length;

  return (
    <TableCard
      title={`${rows.length} awaiting verification`}
      action={
        <div className="row" style={{ gap: 8 }}>
          {rows.length > 0 ? (
            <button
              className="btn btn-sm"
              onClick={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.assignment_id)))}
            >
              {allSelected ? 'Clear' : 'Select all'}
            </button>
          ) : null}
          <button
            className="btn btn-sm btn-primary"
            disabled={busy || selected.size === 0}
            onClick={() => call(
              () => verifyAssignmentsAction([...selected]),
              () => setSelected(new Set()),
            )}
          >
            {busy ? 'Verifying…' : `Verify ${selected.size || ''}`.trim()}
          </button>
        </div>
      }
    >
      {error ? <div className="alert" role="alert" style={{ margin: 14 }}>{error}</div> : null}

      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 36 }} />
            <th>Employee</th><th>Course</th><th>Manager</th><th>Marked done</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.assignment_id}>
              <td>
                <input
                  type="checkbox" className="checkbox"
                  checked={selected.has(r.assignment_id)}
                  onChange={(e) => toggle(r.assignment_id, e.target.checked)}
                  aria-label={`Select ${r.employee_name}, ${r.course_title}`}
                />
              </td>
              <td><Person name={r.employee_name} href={`/employees/${r.employee_id}`} /></td>
              <td><Link className="link" href={`/courses/${r.course_id}`}>{r.course_title}</Link></td>
              <td className="subtle">{r.manager_name ?? '—'}</td>
              <td className="subtle nowrap">{formatDate(r.completed_at)}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={5}><EmptyState message="Nothing is waiting to be verified." /></td></tr>
          ) : null}
        </tbody>
      </table>
    </TableCard>
  );
}
