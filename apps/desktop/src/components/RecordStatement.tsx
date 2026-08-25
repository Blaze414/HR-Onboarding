'use client';

import type { StatementObligation } from '@snoopy/shared';
import { recordStatementAction } from '@/lib/actions';
import { ActionButton } from './Interactive';

/**
 * Record that a statement was handed over.
 *
 * The confirmation names the date the statement was *owed*, not today, because
 * that is what is being written down — settling a debt from March in August is
 * still settling March, and the record should read that way.
 */
export function RecordStatement({ row }: { row: StatementObligation }) {
  return (
    <ActionButton
      label="Record as given"
      busyLabel="Recording…"
      icon="check"
      confirm={`Record that ${row.employee_name} was given the ${row.kind} due ${row.due_on}? This cannot be edited or removed afterwards.`}
      action={() => recordStatementAction({
        employeeId: row.employee_id,
        organisationId: row.organisation_id,
        kind: row.kind,
        dueOn: row.due_on,
      })}
    />
  );
}
