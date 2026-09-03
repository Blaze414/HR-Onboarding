'use client';

import { LOCALE, organisationService, type SmallBusinessTest as Test } from '@snoopy/shared';
import { useState } from 'react';
import { saveSmallBusinessAnswersAction } from '@/lib/actions';
import { Field, useAction } from './Interactive';

/**
 * Are we a small business employer?
 *
 * Three questions, because three things the Act counts are things this database
 * cannot see. The arithmetic is shown rather than the conclusion alone: the
 * answer decides whether a casual waits six months or twelve, and somebody will
 * eventually have to defend it to a person who disagrees.
 */
export function SmallBusinessTest({ test, canEdit }: { test: Test; canEdit: boolean }) {
  const { busy, error, call } = useAction();
  const [associated, setAssociated] = useState(String(test.associated_headcount));
  const [regular, setRegular] = useState(String(test.regular_casuals));
  const [declared, setDeclared] = useState<'count' | 'yes' | 'no'>(
    test.declared_small === null ? 'count' : test.declared_small ? 'yes' : 'no',
  );
  const [note, setNote] = useState(test.declared_note ?? '');

  const counted = test.employees_here + Number(regular || 0) + Number(associated || 0);
  const wouldBe = declared === 'count' ? counted < 15 : declared === 'yes';

  return (
    <div className="stack">
      <div className="row-between">
        <strong style={{ fontSize: 18 }}>
          {test.is_small_business ? 'A small business employer' : 'Not a small business employer'}
        </strong>
        <span className="badge">{test.counted} of 15 counted</span>
      </div>

      <ul className="muted" style={{ margin: '4px 0 12px', paddingLeft: 18 }}>
        {organisationService.consequences(test.is_small_business).map((c) => <li key={c}>{c}</li>)}
      </ul>

      <table className="table">
        <tbody>
          <tr>
            <td>Employees in this workspace</td>
            <td className="num">{test.employees_here}</td>
          </tr>
          <tr>
            <td>
              Casuals employed on a regular and systematic basis
              <div className="subtle">
                {test.casuals_here} casual{test.casuals_here === 1 ? '' : 's'} recorded here. Only those
                with a regular and systematic pattern are counted, which is a judgement about rosters
                rather than something the workspace can read.
              </div>
            </td>
            <td className="num">
              {canEdit ? (
                <input
                  className="input" type="number" min={0} max={test.casuals_here}
                  style={{ width: 80 }} value={regular}
                  onChange={(e) => setRegular(e.target.value)}
                  aria-label="Casuals employed on a regular and systematic basis"
                />
              ) : test.regular_casuals}
            </td>
          </tr>
          <tr>
            <td>
              Employees of associated entities
              <div className="subtle">
                Section 23 counts them too, and they are not in this workspace.
              </div>
            </td>
            <td className="num">
              {canEdit ? (
                <input
                  className="input" type="number" min={0} style={{ width: 80 }}
                  value={associated} onChange={(e) => setAssociated(e.target.value)}
                  aria-label="Employees of associated entities"
                />
              ) : test.associated_headcount}
            </td>
          </tr>
          <tr>
            <td><strong>Counted towards the threshold</strong></td>
            <td className="num"><strong>{counted}</strong></td>
          </tr>
        </tbody>
      </table>

      {/* Contractors are not employees and are not counted. Saying so is worth
          a line, because seeing them missing from the total is otherwise a bug
          report waiting to happen. */}
      {test.contractors_here > 0 ? (
        <p className="subtle">
          {test.contractors_here} contractor{test.contractors_here === 1 ? ' is' : 's are'} engaged here
          and not counted — a contractor is not an employee.
        </p>
      ) : null}

      {canEdit ? (
        <>
          <Field
            label="Your answer"
            hint="If you already know where you stand, say so. Your answer is used in preference to the count — you are the one who has to defend it."
          >
            <select className="select" value={declared} onChange={(e) => setDeclared(e.target.value as typeof declared)}>
              <option value="count">Work it out from the count above</option>
              <option value="yes">We are a small business employer</option>
              <option value="no">We are not a small business employer</option>
            </select>
          </Field>

          {declared !== 'count' ? (
            <Field label="Why" hint="Kept with the answer, for whoever asks later.">
              <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          ) : null}

          {wouldBe !== test.is_small_business ? (
            <div className="alert" role="status">
              Saving this changes the answer to{' '}
              <strong>{wouldBe ? 'a small business employer' : 'not a small business employer'}</strong>,
              which changes when casuals may ask to go permanent and when their statement falls due.
            </div>
          ) : null}

          {error ? <div className="alert" role="alert">{error}</div> : null}

          <div className="row">
            <button
              className="btn btn-sm btn-primary" disabled={busy} aria-busy={busy}
              onClick={() => call(() => saveSmallBusinessAnswersAction({
                associatedHeadcount: Number(associated || 0),
                regularCasuals: Number(regular || 0),
                declaredSmall: declared === 'count' ? null : declared === 'yes',
                declaredNote: note,
              }))}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      ) : null}

      {test.reviewed_at ? (
        <p className="subtle">
          Last reviewed {new Date(test.reviewed_at).toLocaleDateString(LOCALE)}
          {test.reviewed_by_name ? ` by ${test.reviewed_by_name}` : ''}.
        </p>
      ) : (
        <p className="subtle">Never reviewed. The count above is an estimate until somebody answers.</p>
      )}
    </div>
  );
}
