import type { Db } from '../supabase';
import { buildPdf } from './documents-pdf';
import { paySlip as paySlipDocument } from './document-content';

/**
 * Pay records, pay slips, and the seam where a payroll engine plugs in.
 *
 * This file keeps records. It does **not** calculate pay, and the distinction
 * is deliberate rather than unfinished: PAYG withholding scales, the
 * superannuation guarantee and Single Touch Payroll reporting are things that
 * cost somebody real money when they are wrong, and they belong to a payroll
 * engine with a maintained Australian regulation behind it — not to a schema
 * written alongside an onboarding tracker.
 *
 * What the law puts on the employer regardless of who did the arithmetic is
 * exactly what lives here: keep the record (Fair Work Regulations 3.33–3.36),
 * issue the pay slip within one working day (reg 3.46), and be able to produce
 * both seven years later.
 */

/** Money is held in cents. Floating point and payroll do not belong together. */
export const toCents = (amount: number): number => Math.round(amount * 100);
export const fromCents = (cents: number): number => cents / 100;
export const money = (cents: number | null | undefined): string =>
  cents === null || cents === undefined
    ? '—'
    : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100);

export interface PayLine {
  /** e.g. "Saturday penalty", "Salary sacrifice — super". */
  name: string;
  cents: number;
  /** Enough particulars that the employee can see how it was worked out. */
  detail?: string;
}

export interface PayPeriod {
  id: string;
  organisation_id: string;
  starts_on: string;
  ends_on: string;
  paid_on: string | null;
  status: 'Draft' | 'Paid';
  note: string | null;
}

export interface PayRecord {
  id: string;
  organisation_id: string;
  period_id: string;
  employee_id: string;
  employee_name: string;
  employee_email: string;
  starts_on: string;
  ends_on: string;
  paid_on: string | null;
  status: 'Draft' | 'Paid';
  gross_cents: number;
  tax_withheld_cents: number;
  net_cents: number;
  super_cents: number;
  super_fund: string | null;
  super_paid_on: string | null;
  ordinary_hours: number | null;
  overtime_hours: number | null;
  allowances: PayLine[];
  deductions: PayLine[];
  slip_issued_at: string | null;
  slip_due_by: string | null;
  slip_overdue: boolean;
  super_due_by: string | null;
  super_overdue: boolean;
  source: 'Entered by hand' | 'Payroll engine';
  engine_reference: string | null;
}

// ---------------------------------------------------------------- periods
export async function listPeriods(db: Db): Promise<PayPeriod[]> {
  const { data, error } = await db
    .from('pay_periods').select('*').order('starts_on', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PayPeriod[];
}

export async function openPeriod(
  db: Db, input: { organisationId: string; startsOn: string; endsOn: string; note?: string },
): Promise<string> {
  const { data, error } = await db.from('pay_periods').insert({
    organisation_id: input.organisationId,
    starts_on: input.startsOn,
    ends_on: input.endsOn,
    note: input.note?.trim() || null,
  }).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Close the period and record the day the money moved.
 *
 * That date is what the pay slip deadline and the superannuation deadline both
 * count from, which is why closing is a distinct act rather than a side effect
 * of the last line being entered.
 */
export async function markPaid(db: Db, periodId: string, paidOn?: string): Promise<void> {
  const { error } = await db.from('pay_periods')
    .update({ status: 'Paid', paid_on: paidOn ?? new Date().toISOString().slice(0, 10) })
    .eq('id', periodId);
  if (error) throw error;
}

// ---------------------------------------------------------------- records
export async function listRecords(
  db: Db, opts: { periodId?: string; employeeId?: string } = {},
): Promise<PayRecord[]> {
  let query = db.from('pay_obligations').select('*').order('paid_on', { ascending: false, nullsFirst: true });
  if (opts.periodId) query = query.eq('period_id', opts.periodId);
  if (opts.employeeId) query = query.eq('employee_id', opts.employeeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PayRecord[];
}

export interface PayInput {
  organisationId: string;
  periodId: string;
  employeeId: string;
  grossCents: number;
  taxWithheldCents: number;
  netCents: number;
  superCents: number;
  superFund?: string;
  ordinaryHours?: number;
  overtimeHours?: number;
  allowances?: PayLine[];
  deductions?: PayLine[];
  source?: 'Entered by hand' | 'Payroll engine';
  engineReference?: string;
}

export async function recordPay(db: Db, input: PayInput): Promise<void> {
  const { error } = await db.from('pay_records').upsert({
    organisation_id: input.organisationId,
    period_id: input.periodId,
    employee_id: input.employeeId,
    gross_cents: input.grossCents,
    tax_withheld_cents: input.taxWithheldCents,
    net_cents: input.netCents,
    super_cents: input.superCents,
    super_fund: input.superFund?.trim() || null,
    ordinary_hours: input.ordinaryHours ?? null,
    overtime_hours: input.overtimeHours ?? null,
    allowances: input.allowances ?? [],
    deductions: input.deductions ?? [],
    source: input.source ?? 'Entered by hand',
    engine_reference: input.engineReference ?? null,
  }, { onConflict: 'period_id,employee_id' });
  if (error) throw error;
}

/**
 * Build the pay slip itself.
 *
 * Kept separate from issuing it so the same document can be produced for a
 * preview, or rebuilt later from the record — a pay slip is a rendering of
 * figures that cannot change, not a thing with its own state.
 */
export async function buildSlipPdf(record: PayRecord): Promise<Uint8Array> {
  return buildPdf(paySlipDocument(record, money));
}

/**
 * reg 3.46 — within one working day of the payment, on leave or not.
 *
 * Issuing produces the document as well as the timestamp. Before this, issuing
 * a pay slip recorded that one had been issued without there being anything to
 * hand anybody, which is the kind of record that passes an audit right up until
 * somebody asks to see one.
 *
 * The slip is filed as the employee's own personal document, so it inherits
 * everything that already applies to those: they can read it, the access log
 * records anybody else who does, and the seven-year retention keeps it.
 */
export async function issueSlip(
  db: Db, record: PayRecord, bucket = 'documents',
): Promise<void> {
  const pdf = await buildSlipPdf(record);
  const name = `Pay slip ${record.starts_on} to ${record.ends_on}`;
  const path = `${record.organisation_id}/${record.employee_id}/pay-slip-${record.starts_on}.pdf`;

  const { error: uploadError } = await db.storage.from(bucket).upload(path, pdf, {
    contentType: 'application/pdf', upsert: true,
  });
  if (uploadError) throw uploadError;

  const { error: documentError } = await db.from('documents').insert({
    organisation_id: record.organisation_id,
    owner_id: record.employee_id,
    name,
    storage_path: path,
    category: 'HR Documents',
    file_type: 'application/pdf',
    description: `Pay slip for the period ending ${record.ends_on}.`,
  });
  // A slip re-issued for a period that already has one is not an error — the
  // file is replaced above and the row already exists.
  if (documentError && !/duplicate|unique/i.test(documentError.message)) throw documentError;

  const { error } = await db.from('pay_records')
    .update({ slip_issued_at: new Date().toISOString() }).eq('id', record.id);
  if (error) throw error;
}

/**
 * Issue every slip a paid period still owes.
 *
 * The obligation is per person but the work never is: a pay run ends with one
 * decision and thirty slips, and asking somebody to click thirty times is how
 * the thirtieth gets missed. Returns how many went out so the caller can say.
 */
export async function issueOutstandingSlips(db: Db, periodId?: string): Promise<number> {
  const owed = (await listRecords(db, periodId ? { periodId } : {}))
    .filter((r) => r.status === 'Paid' && !r.slip_issued_at);
  for (const record of owed) await issueSlip(db, record);
  return owed.length;
}

/** Payday super: contributions have to reach the fund, not merely be intended. */
export async function recordSuperPaid(db: Db, recordId: string, paidOn?: string): Promise<void> {
  const { error } = await db.from('pay_records')
    .update({ super_paid_on: paidOn ?? new Date().toISOString().slice(0, 10) })
    .eq('id', recordId);
  if (error) throw error;
}

// ------------------------------------------------------------- the engine
/**
 * What a payroll engine has to provide, and nothing more.
 *
 * The workspace holds people, hours and the record; an engine holds the
 * regulation. Keeping the surface this narrow means the app never grows an
 * opinion about tax, and an engine can be swapped without touching anything
 * above this line.
 */
export interface PayrollEngine {
  readonly name: string;
  /** Whether it is configured and reachable. Never assume it is. */
  available(): boolean;
  calculate(request: PayrollRun): Promise<PayrollResult[]>;
}

export interface PayrollRun {
  periodStart: string;
  periodEnd: string;
  employees: {
    id: string;
    /** Whatever the engine knows this person as. */
    reference?: string;
    ordinaryHours?: number;
    overtimeHours?: number;
  }[];
}

export interface PayrollResult {
  employeeId: string;
  grossCents: number;
  taxWithheldCents: number;
  netCents: number;
  superCents: number;
  allowances?: PayLine[];
  deductions?: PayLine[];
  engineReference?: string;
}

/**
 * The Payroll Engine (payrollengine.org) over its REST API.
 *
 * Configured with `PAYROLL_ENGINE_URL` and `PAYROLL_ENGINE_TENANT`. Two things
 * about this are worth stating plainly rather than discovering later:
 *
 *  * The engine ships **no Australian regulation**. It is a framework for
 *    executing regulations somebody authors — PAYG withholding scales, the
 *    superannuation guarantee and STP Phase 2 would all have to be written and
 *    maintained as regulation before any figure it returns is fit to pay
 *    somebody. Pointing this at an empty engine produces confident zeroes.
 *  * Its backend is published for amd64 only and requires SQL Server, so it
 *    does not run on every machine this workspace does.
 *
 * Until it is both configured and carrying a regulation, `available()` is false
 * and the app records figures entered by hand — which is a real way to run
 * small payroll, and an honest one.
 */
export function payrollEngine(config?: { url?: string; tenant?: string }): PayrollEngine {
  const url = config?.url ?? process.env.PAYROLL_ENGINE_URL;
  const tenant = config?.tenant ?? process.env.PAYROLL_ENGINE_TENANT;

  return {
    name: 'Payroll Engine',
    available: () => Boolean(url && tenant),
    async calculate(request: PayrollRun): Promise<PayrollResult[]> {
      if (!url || !tenant) {
        throw new Error(
          'No payroll engine is configured. Set PAYROLL_ENGINE_URL and PAYROLL_ENGINE_TENANT, '
          + 'and make sure it carries an Australian regulation — the engine ships none.',
        );
      }
      const response = await fetch(`${url.replace(/\/$/, '')}/api/tenants/${tenant}/payruns/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodStart: request.periodStart,
          periodEnd: request.periodEnd,
          employees: request.employees,
        }),
      });
      if (!response.ok) {
        throw new Error(`The payroll engine refused the run (${response.status}).`);
      }
      return (await response.json()) as PayrollResult[];
    },
  };
}

/** Gross minus tax minus deductions, for checking what was typed in. */
export function expectedNet(input: {
  grossCents: number; taxWithheldCents: number; deductions?: PayLine[];
}): number {
  const taken = (input.deductions ?? []).reduce((sum, d) => sum + d.cents, 0);
  return input.grossCents - input.taxWithheldCents - taken;
}
