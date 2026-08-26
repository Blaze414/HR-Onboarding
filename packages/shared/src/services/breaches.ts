import type { Db } from '../supabase';

/**
 * The register a data breach is answered from.
 *
 * Under the Notifiable Data Breaches scheme, suspecting an eligible breach
 * starts a clock: a reasonable and expeditious assessment, thirty days at the
 * outside. If the assessment finds reasonable grounds to believe the breach is
 * eligible, the OAIC and the affected individuals are told as soon as
 * practicable — there is no second thirty days for that half.
 *
 * The dates are the record. The prose around them is what a report is written
 * from, but "when did you suspect, and when did you decide" is what is asked
 * first and reconstructed worst.
 */

export type BreachDecision =
  | 'Assessing'
  | 'Eligible — notification required'
  | 'Not eligible'
  | 'Remediated before serious harm';

export interface Breach {
  id: string;
  organisation_id: string;
  suspected_at: string;
  assess_by: string;
  summary: string;
  information: string | null;
  decision: BreachDecision;
  assessed_at: string | null;
  assessment_note: string | null;
  oaic_notified_at: string | null;
  individuals_notified_at: string | null;
  people_affected: number | null;
  raised_by_name: string | null;
  assessed_by_name: string | null;
  assessment_overdue: boolean;
  days_to_assess: number;
  notification_outstanding: boolean;
}

/** Still being assessed first, then anything eligible but not yet notified. */
export async function list(db: Db): Promise<Breach[]> {
  const { data, error } = await db
    .from('breach_register').select('*').order('suspected_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Breach[];
  const rank = (b: Breach) => (b.decision === 'Assessing' ? 0 : b.notification_outstanding ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b));
}

export async function record(
  db: Db,
  input: { organisationId: string; summary: string; information?: string; suspectedAt?: string },
): Promise<void> {
  const { error } = await db.from('data_breaches').insert({
    organisation_id: input.organisationId,
    summary: input.summary.trim(),
    information: input.information?.trim() || null,
    // Backdatable, because a breach is usually suspected before anybody opens
    // this page — and the clock runs from the suspicion, not from the typing.
    ...(input.suspectedAt ? { suspected_at: input.suspectedAt } : {}),
  });
  if (error) throw error;
}

export async function assess(
  db: Db, input: { id: string; decision: BreachDecision; note: string; peopleAffected?: number },
): Promise<void> {
  const { error } = await db.from('data_breaches').update({
    decision: input.decision,
    assessment_note: input.note.trim(),
    people_affected: input.peopleAffected ?? null,
  }).eq('id', input.id);
  if (error) throw error;
}

/** Record that the Commissioner, or the people affected, have been told. */
export async function recordNotification(
  db: Db, input: { id: string; oaic?: boolean; individuals?: boolean },
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await db.from('data_breaches').update({
    ...(input.oaic ? { oaic_notified_at: now } : {}),
    ...(input.individuals ? { individuals_notified_at: now } : {}),
  }).eq('id', input.id);
  if (error) throw error;
}
