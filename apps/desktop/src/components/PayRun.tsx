'use client';

import { payrollService, type PayRecord } from '@snoopy/shared';
import { useState } from 'react';
import {
  issueAllPaySlipsAction, issuePaySlipAction, markPeriodPaidAction, openPayPeriodAction,
  recordPayAction, recordSuperPaidAction,
} from '@/lib/actions';
import { Field, Overlay, useAction } from './Interactive';

export function OpenPeriod() {
  const { busy, error, call } = useAction();
  const [open, setOpen] = useState(false);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');

  return (
    <>
      <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>Open a pay period</button>
      {open ? (
        <Overlay title="Open a pay period" onClose={() => setOpen(false)}>
          <div className="grid grid-2">
            <Field label="From">
              <input className="input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </Field>
            <Field label="To">
              <input className="input" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </Field>
          </div>
          <p className="muted">
            A period stays a draft until you record that it was paid. Everything with a
            deadline — the pay slip, the superannuation — counts from that day, not from today.
          </p>
          {error ? <div className="alert" role="alert">{error}</div> : null}
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              className="btn btn-primary" disabled={busy || !startsOn || !endsOn} aria-busy={busy}
              onClick={() => call(() => openPayPeriodAction({ startsOn, endsOn }), () => setOpen(false))}
            >
              {busy ? 'Opening…' : 'Open it'}
            </button>
          </div>
        </Overlay>
      ) : null}
    </>
  );
}

/**
 * Entering one person's pay for a period.
 *
 * Net is checked against gross minus tax minus deductions and the difference is
 * shown rather than corrected: the two figures are entered separately, they
 * come from somewhere else, and silently overwriting one of them would hide
 * exactly the mistake worth catching.
 */
export function EnterPay({
  periodId, employees, existing,
}: {
  periodId: string;
  employees: { id: string; name: string }[];
  existing: PayRecord[];
}) {
  const { busy, error, call } = useAction();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '');
  const [gross, setGross] = useState('');
  const [tax, setTax] = useState('');
  const [net, setNet] = useState('');
  const [superAmount, setSuperAmount] = useState('');
  const [fund, setFund] = useState('');
  const [ordinary, setOrdinary] = useState('');
  const [overtime, setOvertime] = useState('');

  const g = Number(gross || 0);
  const t = Number(tax || 0);
  const n = Number(net || 0);
  const expected = g - t;
  const mismatch = gross && net && Math.abs(expected - n) > 0.005;
  // 12% since 1 July 2025. A guide beside the field, not a calculation: the
  // guarantee has an earnings base and exclusions this app does not model.
  const guide = g ? (g * 0.12).toFixed(2) : null;

  return (
    <>
      <button className="btn btn-sm" onClick={() => setOpen(true)}>Enter pay</button>
      {open ? (
        <Overlay title="Enter pay for this period" onClose={() => setOpen(false)}>
          <Field label="Employee">
            <select className="select" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {employees.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{existing.some((r) => r.employee_id === p.id) ? ' — already entered' : ''}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-2">
            <Field label="Gross">
              <input className="input" type="number" step="0.01" min="0" value={gross} onChange={(e) => setGross(e.target.value)} />
            </Field>
            <Field label="Tax withheld">
              <input className="input" type="number" step="0.01" min="0" value={tax} onChange={(e) => setTax(e.target.value)} />
            </Field>
          </div>

          <Field
            label="Net"
            hint={mismatch
              ? `Gross minus tax is ${expected.toFixed(2)}. If the difference is a deduction, that is fine — this is only a check.`
              : 'What actually reached their account.'}
          >
            <input className="input" type="number" step="0.01" min="0" value={net} onChange={(e) => setNet(e.target.value)} />
          </Field>

          <div className="grid grid-2">
            <Field label="Superannuation" hint={guide ? `12% of gross is ${guide}` : 'Contributed for this period.'}>
              <input className="input" type="number" step="0.01" min="0" value={superAmount} onChange={(e) => setSuperAmount(e.target.value)} />
            </Field>
            <Field label="Fund">
              <input className="input" value={fund} onChange={(e) => setFund(e.target.value)} placeholder="AustralianSuper" />
            </Field>
          </div>

          <div className="grid grid-2">
            <Field label="Ordinary hours" hint="Required for a casual, or where overtime or penalty rates are paid.">
              <input className="input" type="number" step="0.01" min="0" value={ordinary} onChange={(e) => setOrdinary(e.target.value)} />
            </Field>
            <Field label="Overtime hours">
              <input className="input" type="number" step="0.01" min="0" value={overtime} onChange={(e) => setOvertime(e.target.value)} />
            </Field>
          </div>

          {error ? <div className="alert" role="alert">{error}</div> : null}
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button
              className="btn btn-primary" disabled={busy || !employeeId || !gross} aria-busy={busy}
              onClick={() => call(() => recordPayAction({
                periodId, employeeId,
                gross: g, tax: t, net: n || g - t,
                superAmount: Number(superAmount || 0),
                superFund: fund,
                ordinaryHours: ordinary ? Number(ordinary) : undefined,
                overtimeHours: overtime ? Number(overtime) : undefined,
              }), () => setOpen(false))}
            >
              {busy ? 'Saving…' : 'Save this line'}
            </button>
          </div>
        </Overlay>
      ) : null}
    </>
  );
}

export function ClosePeriod({ periodId, lines }: { periodId: string; lines: number }) {
  const { busy, error, call } = useAction();
  return (
    <>
      <button
        className="btn btn-sm btn-primary" disabled={busy || lines === 0} aria-busy={busy}
        onClick={() => call(() => markPeriodPaidAction(periodId))}
      >
        {busy ? 'Recording…' : 'Record as paid'}
      </button>
      {error ? <span className="error" role="alert">{error}</span> : null}
    </>
  );
}

export function SlipActions({ record }: { record: PayRecord }) {
  const { busy, error, call } = useAction();
  if (record.status !== 'Paid') return <span className="subtle">—</span>;

  return (
    <div className="row" style={{ justifyContent: 'flex-end' }}>
      {!record.slip_issued_at ? (
        <button
          className="btn btn-sm" disabled={busy} aria-busy={busy}
          /*
           * Naming the person in the confirmation. Issuing one slip on a page
           * where others were already issued looks exactly like issuing all of
           * them, and "Saved." does nothing to tell the two apart.
           */
          onClick={() => call(
            () => issuePaySlipAction(record.id),
            undefined,
            { confirmation: `Pay slip issued to ${record.employee_name}.` },
          )}
        >
          Issue pay slip
        </button>
      ) : null}
      {!record.super_paid_on ? (
        <button className="btn btn-sm" disabled={busy} aria-busy={busy} onClick={() => call(() => recordSuperPaidAction(record.id))}>
          Super paid
        </button>
      ) : null}
      {error ? <span className="error" role="alert">{error}</span> : null}
    </div>
  );
}

/** One person's pay slip, as they see it. */
export function PaySlip({ record }: { record: PayRecord }) {
  const { money } = payrollService;
  return (
    <div className="stack">
      <div className="row-between">
        <strong>{record.starts_on} to {record.ends_on}</strong>
        <span className="badge">{record.status === 'Paid' ? `Paid ${record.paid_on}` : 'Not yet paid'}</span>
      </div>
      <dl className="dl">
        <dt>Gross</dt><dd>{money(record.gross_cents)}</dd>
        <dt>Tax withheld</dt><dd>{money(record.tax_withheld_cents)}</dd>
        <dt>Net</dt><dd><strong>{money(record.net_cents)}</strong></dd>
        <dt>Superannuation</dt>
        <dd>
          {money(record.super_cents)}
          {record.super_fund ? ` · ${record.super_fund}` : ''}
          {record.super_paid_on ? ` · paid ${record.super_paid_on}` : ' · not yet paid to the fund'}
        </dd>
        {record.ordinary_hours !== null ? (
          <>
            <dt>Hours</dt>
            <dd>
              {record.ordinary_hours} ordinary
              {record.overtime_hours ? ` · ${record.overtime_hours} overtime` : ''}
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

/** Issue every slip a period still owes, rather than one click per person. */
export function IssueAllSlips({ periodId, owed }: { periodId: string; owed: number }) {
  const { busy, error, call } = useAction();
  if (owed === 0) return null;
  return (
    <>
      <button
        className="btn btn-sm btn-primary" disabled={busy} aria-busy={busy}
        onClick={() => call(
          () => issueAllPaySlipsAction(periodId),
          undefined,
          { confirmation: `${owed} pay slip${owed === 1 ? '' : 's'} issued.` },
        )}
      >
        {busy ? 'Issuing…' : `Issue ${owed} pay slip${owed === 1 ? '' : 's'}`}
      </button>
      {error ? <span className="error" role="alert">{error}</span> : null}
    </>
  );
}
