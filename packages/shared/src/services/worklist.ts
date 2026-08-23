import type { Db } from '../supabase';

/**
 * Everything waiting on the person looking at it.
 *
 * The reports set answers twelve questions well and one badly: "what needs me
 * today". A coordinator was opening seven tabs to find out, which means the
 * quiet ones — acknowledgements, credentials — got checked on the days somebody
 * remembered. Work that is only found by remembering to look is work that
 * silently doesn't happen.
 *
 * Ordered by consequence rather than by age: a credential nobody has checked
 * blocks a roster, an unverified course only makes a figure wrong.
 */
export interface WorklistItem {
  kind: 'credential' | 'document' | 'verification' | 'expiring' | 'training' | 'acknowledgement';
  id: string;
  person: string;
  personId: string;
  what: string;
  /** Why it is in the queue, in the product's own words. */
  detail: string;
  /** Days late, or days remaining as a negative. Null when nothing is timed. */
  age: number | null;
  href: string;
  /** Blocks somebody being placed or paid, rather than merely being untidy. */
  blocking: boolean;
}

export interface Worklist {
  items: WorklistItem[];
  counts: Record<WorklistItem['kind'], number>;
}

const EMPTY_COUNTS: Worklist['counts'] = {
  credential: 0, document: 0, verification: 0, expiring: 0, training: 0, acknowledgement: 0,
};

const daysSince = (iso: string | null): number | null =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;

/**
 * Builds the queue from what the caller can already see.
 *
 * Every query runs through the caller's own session, so a manager gets their
 * team and an administrator gets the workspace — the same rows either of them
 * would find by visiting the reports one at a time.
 */
export async function loadWorklist(db: Db): Promise<Worklist> {
  const [credentials, documents, verifications, expiring, training, acknowledgements] =
    await Promise.all([
      db.from('employee_credentials')
        .select('id, title, created_at, employee_id, employee:profiles!employee_credentials_employee_id_fkey(name)')
        .eq('status', 'Pending'),
      db.from('document_requests')
        .select('id, title, submitted_at, employee_id, employee:profiles!document_requests_employee_id_fkey(name)')
        .eq('status', 'Submitted'),
      db.from('awaiting_verification').select('assignment_id, employee_id, employee_name, course_title, completed_at'),
      db.from('expiring_credentials').select('*'),
      db.from('outstanding_required_training').select('*').eq('is_overdue', true),
      db.from('outstanding_acknowledgements').select('*'),
    ]);

  const items: WorklistItem[] = [];

  for (const row of credentials.data ?? []) {
    const person = (row as { employee?: { name?: string } }).employee?.name ?? 'Someone';
    items.push({
      kind: 'credential', id: row.id, person, personId: row.employee_id,
      what: row.title,
      detail: 'Offered, not yet checked. It counts for nothing until it is.',
      age: daysSince(row.created_at),
      href: '/reports?report=checks',
      // Until somebody looks, this person cannot be rostered on the strength of it.
      blocking: true,
    });
  }

  for (const row of documents.data ?? []) {
    const person = (row as { employee?: { name?: string } }).employee?.name ?? 'Someone';
    items.push({
      kind: 'document', id: row.id, person, personId: row.employee_id,
      what: row.title,
      detail: 'Returned and waiting to be accepted.',
      age: daysSince(row.submitted_at),
      href: `/employees/${row.employee_id}`,
      blocking: true,
    });
  }

  for (const row of expiring.data ?? []) {
    items.push({
      kind: 'expiring', id: row.credential_id, person: row.employee_name, personId: row.employee_id,
      what: row.credential_name,
      detail: row.has_expired
        ? 'Lapsed. They have dropped out of cover for it.'
        : `Expires in ${row.days_left} ${row.days_left === 1 ? 'day' : 'days'}.`,
      age: row.has_expired ? Math.abs(row.days_left) : -row.days_left,
      href: '/reports?report=expiring',
      blocking: row.has_expired || row.blocks_a_department,
    });
  }

  for (const row of verifications.data ?? []) {
    items.push({
      kind: 'verification', id: row.assignment_id, person: row.employee_name, personId: row.employee_id,
      what: row.course_title,
      detail: 'Marked complete by the learner, unconfirmed.',
      age: daysSince(row.completed_at),
      href: '/reports?report=verify',
      blocking: false,
    });
  }

  for (const row of training.data ?? []) {
    items.push({
      kind: 'training', id: row.assignment_id, person: row.employee_name, personId: row.employee_id,
      what: row.course_title,
      detail: `Required training, ${row.days_overdue} ${row.days_overdue === 1 ? 'day' : 'days'} overdue.`,
      age: row.days_overdue,
      href: '/reports?report=required',
      blocking: false,
    });
  }

  for (const row of acknowledgements.data ?? []) {
    items.push({
      kind: 'acknowledgement', id: `${row.document_id}-${row.employee_id}`,
      person: row.employee_name, personId: row.employee_id,
      what: row.document_name,
      detail: 'Has not confirmed they have read it.',
      age: daysSince(row.published_at),
      href: '/reports?report=acknowledgements',
      blocking: false,
    });
  }

  const counts = { ...EMPTY_COUNTS };
  for (const item of items) counts[item.kind] += 1;

  /*
   * Blocking work first, then oldest. Sorting purely by age would bury a
   * certificate submitted this morning that stops somebody being rostered
   * tomorrow underneath a month-old acknowledgement nobody is waiting on.
   */
  items.sort((a, b) => {
    if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
    return (b.age ?? 0) - (a.age ?? 0);
  });

  return { items, counts };
}
