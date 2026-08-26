import type { Db } from '../supabase';

/**
 * Whether this employer is a small business employer, and the working behind it.
 *
 * Section 23 of the Fair Work Act counts employees of the employer *and of any
 * associated entities*, and counts casuals only where they are employed on a
 * regular and systematic basis. Neither is derivable from this database:
 * associated entities are not in it, and whether a casual's pattern is regular
 * and systematic is a judgement about rosters. So both are asked.
 *
 * The threshold decides real things — twelve months before a casual may ask to
 * go permanent instead of six, and a different schedule for the casual
 * statement — which is why the answer is shown with its arithmetic rather than
 * as a number that appears from nowhere.
 */
export interface SmallBusinessTest {
  organisation_id: string;
  employees_here: number;
  regular_casuals: number;
  associated_headcount: number;
  counted: number;
  /** Set when the employer has answered the question themselves. */
  declared_small: boolean | null;
  declared_note: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  is_small_business: boolean;
  casuals_here: number;
  contractors_here: number;
}

export async function smallBusinessTest(db: Db): Promise<SmallBusinessTest | null> {
  const { data, error } = await db.from('small_business_test').select('*').maybeSingle();
  if (error) throw error;
  return (data as SmallBusinessTest) ?? null;
}

export async function saveSmallBusinessAnswers(
  db: Db,
  organisationId: string,
  input: {
    associatedHeadcount: number;
    regularCasuals: number;
    /** null = work it out from the count; true/false = the employer's own answer. */
    declaredSmall: boolean | null;
    declaredNote?: string;
  },
): Promise<void> {
  const { error } = await db.from('organisation_settings').update({
    associated_headcount: Math.max(0, Math.trunc(input.associatedHeadcount)),
    regular_casuals: Math.max(0, Math.trunc(input.regularCasuals)),
    declared_small: input.declaredSmall,
    declared_note: input.declaredNote?.trim() || null,
  }).eq('organisation_id', organisationId);
  if (error) throw error;
}

/** What the answer changes, said plainly, because a threshold with no consequence is trivia. */
export function consequences(isSmall: boolean): string[] {
  return isSmall
    ? [
      'A casual can ask to become permanent after 12 months, not 6.',
      'The Casual Employment Information Statement is due at the start and again at 12 months.',
      'The minimum employment period before an unfair dismissal claim is 12 months.',
    ]
    : [
      'A casual can ask to become permanent after 6 months.',
      'The Casual Employment Information Statement is due at the start, at 6 months, at 12 months, and every 12 months after that.',
      'The minimum employment period before an unfair dismissal claim is 6 months.',
    ];
}
