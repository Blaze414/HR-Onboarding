'use client';

import { useState } from 'react';
import type { Profile } from '@snoopy/shared';
import { assignCourseAction, assignCourseToDepartmentAction } from '@/lib/actions';
import { Icon } from './Icon';
import { Overlay, useAction } from './Interactive';

export function AssignLearners({
  courseId, candidates, departments,
}: {
  courseId: string;
  candidates: Pick<Profile, 'id' | 'name' | 'job_title'>[];
  departments: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [required, setRequired] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const { busy, error, call } = useAction();

  const visible = candidates.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)} disabled={candidates.length === 0}>
        <Icon name="plus" size={15} /> Assign learners
      </button>

      {open ? (
        <Overlay
          title="Assign learners"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary" disabled={busy || (selected.length === 0 && !departmentId)} aria-busy={busy}
                onClick={() => call(
                  () => (departmentId
                    // A whole department is assigned by name rather than by
                    // ticking every person: the membership is read at the moment
                    // of assigning, so nobody is missed off the list by hand.
                    ? assignCourseToDepartmentAction(courseId, departmentId, { required, dueDate: dueDate || null })
                    : assignCourseAction(courseId, selected, { required, dueDate: dueDate || null })),
                  () => {
                    setOpen(false); setSelected([]); setRequired(false);
                    setDueDate(''); setDepartmentId('');
                  },
                )}
              >
                {busy
                  ? 'Assigning…'
                  : departmentId
                    ? 'Assign whole department'
                    : `Assign ${selected.length || ''}`.trim()}
              </button>
            </>
          }
        >
          {error ? <div className="alert" role="alert">{error}</div> : null}

          <div className="assign-terms">
            <label className="assign-toggle">
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
              <span>
                <strong>Required training</strong>
                <span className="subtle">Everyone selected must complete it.</span>
              </span>
            </label>
            {required ? (
              <label className="assign-due">
                <span className="subtle">Due by</span>
                <input
                  className="input" type="date" value={dueDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </label>
            ) : null}
          </div>

          <label className="assign-dept">
            <span className="subtle">Assign a whole department</span>
            <select
              className="select" value={departmentId}
              onChange={(e) => { setDepartmentId(e.target.value); setSelected([]); }}
            >
              <option value="">Choose people individually…</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>

          {departmentId ? (
            <p className="subtle" style={{ margin: '0 0 12px' }}>
              Everybody currently in that department will be assigned. People who join later are not.
            </p>
          ) : (
            <input
              className="input" style={{ width: '100%', marginBottom: 12 }} type="search"
              placeholder="Search employees…" value={search} onChange={(e) => setSearch(e.target.value)}
            />
          )}

          <div className="row-between" style={{ marginBottom: 10 }}>
            <span className="subtle">{selected.length} selected</span>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setSelected(selected.length === visible.length ? [] : visible.map((v) => v.id))}
            >
              {selected.length === visible.length ? 'Clear all' : 'Select all'}
            </button>
          </div>

          <div className="step-list">
            {visible.map((c) => (
              <label key={c.id} className="step" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox" className="checkbox" checked={selected.includes(c.id)}
                  onChange={(e) =>
                    setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((id) => id !== c.id)))
                  }
                />
                <span className="title">{c.name}</span>
                <span className="subtle">{c.job_title}</span>
              </label>
            ))}
            {visible.length === 0 ? <p className="subtle">Everyone matching is already assigned.</p> : null}
          </div>
        </Overlay>
      ) : null}
    </>
  );
}
