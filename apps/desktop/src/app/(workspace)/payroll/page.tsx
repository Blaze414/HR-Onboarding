import Link from 'next/link';
import { employeeService, formatDate, formatDateTime, payrollService } from '@snoopy/shared';
import { ClosePeriod, EnterPay, IssueAllSlips, OpenPeriod, PaySlip, SlipActions } from '@/components/PayRun';
import { EmptyState, PageHead, StatCard, StatusBadge, TableCard, Tabs } from '@/components/ui';
import { requireCapability, sessionCan } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * Pay periods, and what each one still owes.
 *
 * This page keeps records; it does not work out what anybody should be paid.
 * The figures arrive from a payroll engine or from somebody who has them, and
 * what happens here is the part the law puts on the employer regardless of who
 * did the arithmetic: the record exists, the pay slip goes out within one
 * working day, and the superannuation reaches the fund.
 */
export default async function PayrollPage({
  searchParams,
}: { searchParams: Promise<{ period?: string }> }) {
  const { period } = await searchParams;
  /*
   * One route, two views. Somebody who runs the pay sees the pay run; everybody
   * else sees their own history, all of it. Splitting these into two addresses
   * would mean an employee following a link to /payroll and being told they are
   * not allowed to see their own pay slips.
   */
  const session = await requireCapability('payroll.view_own');
  const db = await getServerSupabase();

  if (!sessionCan(session, 'payroll.manage')) return <MyPay db={db} userId={session.userId} />;

  const [periods, employees] = await Promise.all([
    payrollService.listPeriods(db),
    employeeService.listEmployees(db),
  ]);
  const current = periods.find((p) => p.id === period) ?? periods[0] ?? null;
  const records = current ? await payrollService.listRecords(db, { periodId: current.id }) : [];
  const all = await payrollService.listRecords(db);

  const slipsOwed = all.filter((r) => r.status === 'Paid' && !r.slip_issued_at);
  const superOwed = all.filter((r) => r.status === 'Paid' && !r.super_paid_on);
  const { money } = payrollService;

  return (
    <>
      <PageHead
        title="Pay"
        subtitle="Pay records, pay slips and superannuation. The figures come from your payroll engine; the obligations are kept here."
      />

      <div className="stat-row">
        <StatCard
          label="Pay slips owed" value={slipsOwed.length}
          hint="Within one working day of payment — reg 3.46"
        />
        <StatCard
          label="Superannuation not yet paid" value={superOwed.length}
          hint="Payday super: it has to reach the fund"
        />
        <StatCard label="Periods recorded" value={periods.length} />
      </div>

      <div className="row" style={{ justifyContent: 'flex-end', margin: '16px 0' }}>
        <OpenPeriod />
      </div>

      {periods.length === 0 ? (
        <EmptyState message="No pay periods yet. Open one to start recording what people were paid." />
      ) : (
        <>
          <Tabs
            tabs={periods.slice(0, 8).map((p) => ({
              href: `/payroll?period=${p.id}`,
              label: `${formatDate(p.starts_on)} – ${formatDate(p.ends_on)}`,
            }))}
            current={`/payroll?period=${current?.id}`}
          />

          {current ? (
            <TableCard
              title={`${records.length} in this period · ${money(records.reduce((s, r) => s + r.gross_cents, 0))} gross`}
              action={
                <div className="row">
                  {current.status === 'Paid' ? (
                    <IssueAllSlips
                      periodId={current.id}
                      owed={records.filter((r) => !r.slip_issued_at).length}
                    />
                  ) : null}
                  {current.status === 'Draft' ? (
                    <>
                      <EnterPay
                        periodId={current.id}
                        employees={employees.map((e) => ({ id: e.id, name: e.name }))}
                        existing={records}
                      />
                      <ClosePeriod periodId={current.id} lines={records.length} />
                    </>
                  ) : (
                    <span className="badge badge-ok">Paid {formatDate(current.paid_on)}</span>
                  )}
                </div>
              }
            >
              {records.length === 0 ? (
                <EmptyState message="Nothing entered for this period yet." />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Employee</th><th className="num">Gross</th><th className="num">Tax</th>
                      <th className="num">Net</th><th className="num">Super</th>
                      <th>Pay slip</th><th>Super paid</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/employees/${r.employee_id}`}>{r.employee_name}</Link>
                          <div className="subtle">
                            {r.source}
                            {r.engine_reference ? ` · ${r.engine_reference}` : ''}
                          </div>
                        </td>
                        <td className="num">{money(r.gross_cents)}</td>
                        <td className="num">{money(r.tax_withheld_cents)}</td>
                        <td className="num">{money(r.net_cents)}</td>
                        <td className="num">{money(r.super_cents)}</td>
                        <td className={r.slip_overdue ? 'warn' : undefined}>
                          {r.slip_issued_at
                            ? formatDateTime(r.slip_issued_at)
                            : r.status === 'Paid'
                              ? <>Due {formatDate(r.slip_due_by)}{r.slip_overdue ? ' — overdue' : ''}</>
                              : <span className="subtle">—</span>}
                        </td>
                        <td className={r.super_overdue ? 'warn' : undefined}>
                          {r.super_paid_on
                            ? formatDate(r.super_paid_on)
                            : r.status === 'Paid'
                              ? <>Due {formatDate(r.super_due_by)}{r.super_overdue ? ' — overdue' : ''}</>
                              : <span className="subtle">—</span>}
                        </td>
                        <td className="num"><SlipActions record={r} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TableCard>
          ) : null}
        </>
      )}

      <p className="muted" style={{ marginTop: 16 }}>
        A paid period is closed: its figures cannot be edited, and a correction is made by
        paying an adjustment in a later period. Pay records are kept for seven years like every
        other employment record.
      </p>
    </>
  );
}

/**
 * An employee's own pay, in full.
 *
 * Every period they have been paid in, not the last few — a pay slip is
 * something people go looking for at tax time or when a bank asks, and a list
 * that stops at four is a list that fails exactly then. The read policy does
 * the limiting: their own rows and nobody else's.
 */
async function MyPay({ db, userId }: { db: any; userId: string }) {
  const records = await payrollService.listRecords(db, { employeeId: userId });
  const { money } = payrollService;
  const paid = records.filter((r) => r.status === 'Paid');
  const ytd = paid.reduce(
    (sum, r) => ({
      gross: sum.gross + r.gross_cents,
      tax: sum.tax + r.tax_withheld_cents,
      superAmount: sum.superAmount + r.super_cents,
    }),
    { gross: 0, tax: 0, superAmount: 0 },
  );

  return (
    <>
      <PageHead title="My pay" subtitle="Every period you have been paid, and the pay slip for each." />

      {records.length === 0 ? (
        <EmptyState message="Nothing recorded yet. Pay slips appear here as soon as a period is paid." />
      ) : (
        <>
          <div className="stat-row">
            <StatCard label="Gross, all recorded periods" value={money(ytd.gross)} />
            <StatCard label="Tax withheld" value={money(ytd.tax)} />
            <StatCard label="Superannuation" value={money(ytd.superAmount)} />
          </div>

          <TableCard title={`${records.length} period${records.length === 1 ? '' : 's'}`}>
            <table className="table">
              <thead>
                <tr>
                  <th>Period</th><th className="num">Gross</th><th className="num">Tax</th>
                  <th className="num">Net</th><th className="num">Super</th><th>Pay slip</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {formatDate(r.starts_on)} – {formatDate(r.ends_on)}
                      <div className="subtle">
                        {r.paid_on ? `Paid ${formatDate(r.paid_on)}` : 'Not yet paid'}
                      </div>
                    </td>
                    <td className="num">{money(r.gross_cents)}</td>
                    <td className="num">{money(r.tax_withheld_cents)}</td>
                    <td className="num">{money(r.net_cents)}</td>
                    <td className="num">{money(r.super_cents)}</td>
                    <td>
                      {r.slip_issued_at ? (
                        <>
                          {formatDateTime(r.slip_issued_at)}
                          <div className="subtle">
                            <Link href="/documents">Find it in your documents</Link>
                          </div>
                        </>
                      ) : <span className="subtle">Not yet issued</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>

          <div className="grid grid-2" style={{ marginTop: 16 }}>
            {records.slice(0, 2).map((r) => (
              <div className="card" key={r.id} style={{ padding: 20 }}>
                <PaySlip record={r} />
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
