import Link from 'next/link';
import { onboardingService } from '@snoopy/shared';
import { handoverSummaryAction } from '@/lib/actions';
import { ReassignTasks } from './ReassignTasks';
import { StartOffboarding } from './StartOffboarding';

/**
 * What this person still owns.
 *
 * Shown before anyone deactivates them, because a leaver's open work does not
 * leave with them: the tasks stay assigned to an account nobody reads, and the
 * required training sits outstanding until someone notices. Naming the amount is
 * what turns "deactivate" from a flag into a handover.
 */
export async function Handover({
  employeeId, employeeName, isActive, candidates, db, canOffboard,
}: {
  employeeId: string;
  employeeName: string;
  isActive: boolean;
  candidates: { id: string; name: string }[];
  db: any;
  canOffboard: boolean;
}) {
  const [summary, exitPlans, exitTemplates] = await Promise.all([
    handoverSummaryAction(employeeId),
    onboardingService.listPlansOfKind(db, employeeId, 'Offboarding'),
    onboardingService.listTemplatesOfKind(db, 'Offboarding'),
  ]);
  const total = summary.tasks + summary.requiredTraining + summary.onboarding;
  const leaving = exitPlans.length > 0;

  // Nothing outstanding and nobody leaving: there is nothing to say.
  if (total === 0 && !leaving && !canOffboard) return null;

  const firstName = employeeName.split(' ')[0];

  // Assembled rather than nested in the markup: the sentence has four shapes
  // depending on what is outstanding, and inline conditionals made it unreadable.
  const held = [
    summary.tasks > 0 ? `${summary.tasks} open ${summary.tasks === 1 ? 'task' : 'tasks'}` : null,
    summary.requiredTraining > 0
      ? `${summary.requiredTraining} required ${summary.requiredTraining === 1 ? 'course' : 'courses'}`
      : null,
    summary.onboarding > 0 ? 'onboarding in progress' : null,
  ].filter(Boolean) as string[];

  const headline = held.length === 0
    ? `${firstName} has nothing outstanding.`
    : `${firstName} still has ${held.length === 1
        ? held[0]
        : `${held.slice(0, -1).join(', ')} and ${held[held.length - 1]}`}.`;

  return (
    <div className="handover" role="status">
      <div className="handover-text">
        <strong>{headline}</strong>
        <span>
          {leaving
            ? 'An exit plan is running. Work through it before the account is closed.'
            : isActive
              ? 'Hand this over before deactivating, or it stays assigned to an account nobody reads.'
              : 'This account is inactive, so nobody is working on any of it.'}
        </span>
      </div>

      {summary.tasks > 0 && candidates.length > 0 ? (
        <ReassignTasks employeeId={employeeId} employeeName={firstName} candidates={candidates} />
      ) : null}

      {leaving ? (
        <Link className="btn btn-sm" href={`/onboarding/${exitPlans[0].id}`}>Open exit plan</Link>
      ) : canOffboard && exitTemplates.length > 0 ? (
        <StartOffboarding
          employeeId={employeeId}
          employeeName={firstName}
          templates={exitTemplates.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }))}
        />
      ) : null}

      <Link className="btn btn-sm" href={`/tasks?assignee=${employeeId}`}>View tasks</Link>
    </div>
  );
}
