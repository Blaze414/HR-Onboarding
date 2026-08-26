import type { Db } from '../supabase';

/**
 * The employee choice pathway.
 *
 * A casual notifies the employer in writing that they want permanent
 * employment; the employer consults, then answers in writing within 21 days,
 * and may only refuse on one of three grounds. Every one of those rules is
 * enforced in the database — this file reads the state and submits the moves.
 */

export type ConversionStatus = 'Awaiting response' | 'Accepted' | 'Refused' | 'Withdrawn';

export type RefusalGround =
  | 'Still meets the definition of a casual employee'
  | 'Fair and reasonable operational grounds'
  | 'Would not comply with a legal recruitment process';

/**
 * The full wording, for the screen. The stored labels are shortened to fit a
 * Postgres enum; a person answering a notice should see what the Act says,
 * because choosing one of these is a legal position, not a dropdown.
 */
export const REFUSAL_GROUNDS: { value: RefusalGround; label: string; help: string }[] = [
  {
    value: 'Still meets the definition of a casual employee',
    label: 'They still meet the definition of a casual employee',
    help: 'There is no firm advance commitment to continuing and indefinite work.',
  },
  {
    value: 'Fair and reasonable operational grounds',
    label: 'Fair and reasonable operational grounds',
    help: 'Substantial changes to how the work is organised, or the role will not exist in 12 months.',
  },
  {
    value: 'Would not comply with a legal recruitment process',
    label: 'Accepting would not comply with a recruitment or selection process required by law',
    help: 'A statutory process applies to filling the position.',
  },
];

export interface ConversionNotice {
  id: string;
  organisation_id: string;
  employee_id: string;
  given_at: string;
  due_by: string;
  status: ConversionStatus;
  consulted_at: string | null;
  responded_at: string | null;
  refusal_ground: RefusalGround | null;
  response_note: string | null;
  note: string | null;
  employee_name: string;
  employee_email: string;
  manager_name: string | null;
  responded_by_name: string | null;
  is_overdue: boolean;
  days_left: number;
}

export interface Eligibility {
  eligible: boolean;
  reason: string;
  qualifies_on: string | null;
}

/** Can this person give notice today, and if not, why not and from when. */
export async function eligibility(db: Db, employeeId: string): Promise<Eligibility> {
  const { data, error } = await db.rpc('casual_conversion_eligibility', { employee: employeeId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? { eligible: false, reason: 'Eligibility could not be worked out.', qualifies_on: null }) as Eligibility;
}

/** Outstanding first, then the ones that were answered. */
const ORDER: Record<ConversionStatus, number> = {
  'Awaiting response': 0, Accepted: 1, Refused: 1, Withdrawn: 2,
};

export async function list(
  db: Db, opts: { employeeId?: string } = {},
): Promise<ConversionNotice[]> {
  let query = db.from('casual_conversion_worklist').select('*').order('due_by');
  if (opts.employeeId) query = query.eq('employee_id', opts.employeeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data as ConversionNotice[]).sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || a.due_by.localeCompare(b.due_by),
  );
}

/** The employee's move. The database checks they are entitled to make it. */
export async function giveNotice(
  db: Db, input: { organisationId: string; employeeId: string; note?: string },
): Promise<void> {
  const { error } = await db.from('casual_conversion_notices').insert({
    organisation_id: input.organisationId,
    employee_id: input.employeeId,
    note: input.note?.trim() || null,
  });
  if (error) throw error;
}

/**
 * Record that the employee was consulted.
 *
 * Its own step, because it is its own obligation: an answer written without a
 * consultation is a defective answer, and the database refuses to accept one
 * until this has happened.
 */
export async function recordConsultation(db: Db, id: string): Promise<void> {
  const { error } = await db.from('casual_conversion_notices')
    .update({ consulted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function accept(
  db: Db,
  input: { id: string; hours: 'Full-time' | 'Part-time'; basis: 'Ongoing' | 'Fixed term'; note?: string },
): Promise<void> {
  const { error } = await db.from('casual_conversion_notices').update({
    status: 'Accepted',
    new_hours: input.hours,
    new_basis: input.basis,
    response_note: input.note?.trim() || null,
  }).eq('id', input.id);
  if (error) throw error;
}

export async function refuse(
  db: Db, input: { id: string; ground: RefusalGround; note?: string },
): Promise<void> {
  const { error } = await db.from('casual_conversion_notices').update({
    status: 'Refused',
    refusal_ground: input.ground,
    response_note: input.note?.trim() || null,
  }).eq('id', input.id);
  if (error) throw error;
}

export async function withdraw(db: Db, id: string): Promise<void> {
  const { error } = await db.from('casual_conversion_notices')
    .update({ status: 'Withdrawn' }).eq('id', id);
  if (error) throw error;
}
