import type { Db } from '../supabase';

/**
 * What the workspace is expected to have written down, and whether it has.
 *
 * The register is derived, not maintained: the obligations are reference data,
 * and coverage comes from the documents that claim them plus the read receipts
 * already recorded against the version in force. Nothing here has to be kept up
 * to date by hand, which is the only kind of compliance register that stays
 * true for longer than a month.
 */

export type PolicyRequirement =
  | 'Right to disconnect'
  | 'Preventing sexual harassment'
  | 'Work health and safety, including psychosocial hazards'
  | 'Discrimination, bullying and equal opportunity'
  | 'Privacy and personal information'
  | 'Whistleblower protections'
  | 'Workplace surveillance';

export type PolicyStatus =
  | 'No policy'
  | 'Not required reading'
  | 'Not read by everybody'
  | 'In place';

export interface PolicyRegisterRow {
  organisation_id: string;
  requirement: PolicyRequirement;
  authority: string;
  detail: string;
  /** False where the obligation depends on size, structure or jurisdiction. */
  universal: boolean;
  sort_order: number;
  document_id: string | null;
  document_name: string | null;
  version: number | null;
  published_at: string | null;
  requires_acknowledgement: boolean | null;
  acknowledged: number;
  headcount: number;
  outstanding: number | null;
  status: PolicyStatus;
}

export async function register(db: Db): Promise<PolicyRegisterRow[]> {
  const { data, error } = await db.from('policy_register').select('*').order('sort_order');
  if (error) throw error;
  return (data ?? []) as PolicyRegisterRow[];
}

/**
 * Point an obligation at the document that answers it.
 *
 * One document per obligation, enforced by a unique index rather than by this
 * function: two documents both claiming to be the harassment policy is the
 * state where nobody knows which one is in force.
 */
export async function claim(
  db: Db, documentId: string, requirement: PolicyRequirement | null,
): Promise<void> {
  const { error } = await db.from('documents')
    .update({ satisfies_policy: requirement })
    .eq('id', documentId);
  if (error) throw error;
}

/** How much of the register is settled — the one number worth putting on a tile. */
export function coverage(rows: PolicyRegisterRow[]): { inPlace: number; applicable: number } {
  const applicable = rows.filter((r) => r.universal);
  return {
    inPlace: applicable.filter((r) => r.status === 'In place').length,
    applicable: applicable.length,
  };
}
