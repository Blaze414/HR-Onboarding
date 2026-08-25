import type { Db } from '../supabase';

/**
 * Statements the employer owes, and when.
 *
 * The Fair Work Act requires the Fair Work Information Statement for everybody
 * and the Casual Employment Information Statement for casuals — the second
 * repeatedly, for as long as the employment stays casual. Nothing here decides
 * *when*: `statement_obligations` derives every falling-due from the person's
 * start date and the size of the workspace, so this file only reads it and
 * records what was handed over.
 */
export interface StatementObligation {
  employee_id: string;
  organisation_id: string;
  kind: 'Fair Work Information Statement' | 'Casual Employment Information Statement';
  due_on: string;
  employee_name: string;
  employee_email: string;
  manager_name: string | null;
  issued_at: string | null;
  issue_id: string | null;
  status: 'Given' | 'Overdue' | 'Upcoming';
}

/** Overdue first, then what is coming, then what is settled. */
const ORDER: Record<StatementObligation['status'], number> = { Overdue: 0, Upcoming: 1, Given: 2 };

export async function listObligations(
  db: Db, opts: { employeeId?: string } = {},
): Promise<StatementObligation[]> {
  let query = db.from('statement_obligations').select('*').order('due_on');
  if (opts.employeeId) query = query.eq('employee_id', opts.employeeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data as StatementObligation[]).sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || a.due_on.localeCompare(b.due_on),
  );
}

/**
 * Record that a statement was handed over.
 *
 * `due_on` says which falling-due this settles, so recording one late does not
 * silently become recording it on time. The row cannot be edited or removed
 * afterwards — there is no update or delete policy on the table.
 */
export async function recordIssue(
  db: Db,
  input: { employeeId: string; organisationId: string; kind: StatementObligation['kind']; dueOn: string; note?: string },
): Promise<void> {
  const { data: session } = await db.auth.getUser();
  const { error } = await db.from('statement_issues').insert({
    organisation_id: input.organisationId,
    employee_id: input.employeeId,
    kind: input.kind,
    due_on: input.dueOn,
    issued_by: session.user?.id ?? null,
    note: input.note ?? null,
  });
  if (error) throw error;
}
