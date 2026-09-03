import { loadWorklist, type WorklistItem } from '@snoopy/shared';
import { EmptyState, PageHead } from '@/components/ui';
import { WorklistGroup } from '@/components/WorklistGroup';
import { requireSession, sessionCan } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const GROUPS: { kind: WorklistItem['kind']; title: string; blurb: string }[] = [
  { kind: 'credential', title: 'Certificates to check',
    blurb: 'Offered by staff. Until one is checked it counts for nothing, and nobody can be rostered on it.' },
  { kind: 'document', title: 'Documents returned',
    blurb: 'Sent back to you and waiting to be accepted or corrected.' },
  { kind: 'expiring', title: 'Expiring or lapsed',
    blurb: 'Renew these before somebody drops out of cover without anyone noticing.' },
  { kind: 'verification', title: 'Training to confirm',
    blurb: 'Marked complete by the learner. Unconfirmed, so the completion figures do not yet mean anything.' },
  { kind: 'training', title: 'Required training overdue',
    blurb: 'Already chased automatically. Listed here when it needs a person rather than another reminder.' },
  { kind: 'acknowledgement', title: 'Acknowledgements owed',
    blurb: 'Documents published to everyone that some people have not confirmed reading.' },
];

/**
 * What needs this person today.
 *
 * The reports set answers twelve questions well and one badly — "what is waiting
 * on me" — because the answer was spread across seven of its tabs. Work found
 * only by remembering to look is work that happens on the days somebody
 * remembers.
 *
 * Everything reads through the caller's own session, so a manager sees their
 * team and an administrator sees the workspace, without either of them choosing
 * a filter.
 */
export default async function WorklistPage() {
  const session = await requireSession();
  const db = await getServerSupabase();
  const { items } = await loadWorklist(db);

  /*
   * Seeing a queue and being allowed to clear it are separate grants, so the
   * batch controls are decided here rather than in the browser. A manager who
   * can see a certificate but not accept one gets the list without the button,
   * instead of a button that fails.
   */
  const canClear: Partial<Record<WorklistItem['kind'], boolean>> = {
    credential: sessionCan(session, 'credential.verify'),
    document: sessionCan(session, 'document.request'),
    verification: sessionCan(session, 'course.verify'),
  };

  const blocking = items.filter((i) => i.blocking).length;
  const firstName = session.profile.name.split(' ')[0];

  return (
    <>
      <PageHead
        title={`What needs you, ${firstName}`}
        subtitle={
          items.length === 0
            ? 'Nothing is waiting on you.'
            : blocking > 0
              ? `${items.length} waiting · ${blocking} ${blocking === 1 ? 'is' : 'are'} holding somebody up.`
              : `${items.length} waiting. Nothing is blocking anybody.`
        }
      />

      {items.length === 0 ? (
        <EmptyState message="Nothing needs you right now. Anything staff send in will appear here." />
      ) : null}

      {/*
       * Its own gap rather than the page's default `.content > * + *` rhythm:
       * six independent queues read as one dense stack at 18px apart, and
       * each is already carrying a header + blurb of its own — they need more
       * air between them than a run of body text does.
       */}
      <div className="worklist-list">
        {GROUPS.map((group) => {
          const rows = items.filter((i) => i.kind === group.kind);
          if (rows.length === 0) return null;

          return (
            <WorklistGroup
              key={group.kind}
              kind={group.kind}
              title={group.title}
              blurb={group.blurb}
              rows={rows}
              canClear={canClear[group.kind] ?? false}
            />
          );
        })}
      </div>
    </>
  );
}
