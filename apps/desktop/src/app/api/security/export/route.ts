import { securityService, toCsv } from '@snoopy/shared';
import { requireCapability } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

/**
 * The record, as a file somebody can attach to a report.
 *
 * A breach notification to the OAIC and to the people affected is a document,
 * and the evidence behind it has to leave the app in a form a lawyer or a
 * regulator can read. That is the whole reason this exists — not convenience.
 *
 * Exporting is a look like any other, so it is recorded like any other, with
 * the same reason attached. A copy taken quietly would defeat the point of
 * recording the ones taken loudly.
 */
export async function GET(request: Request) {
  await requireCapability('user.role_management_self');
  const db = await getServerSupabase();

  const params = new URL(request.url).searchParams;
  const view = params.get('view') ?? 'sign-ins';
  const person = params.get('person') ?? undefined;
  const reason = params.get('reason')?.trim();

  if (!reason) {
    return new Response('Say why you are looking.', { status: 400 });
  }
  await securityService.recordLogRead(db, `Exported: ${reason}`, person);

  const stamp = new Date().toISOString().slice(0, 10);

  if (view === 'actions') {
    const rows = await securityService.listAudit(db, { actorId: person, limit: 5000 });
    const csv = toCsv(
      rows.map((r) => ({
        at: r.at,
        actor: r.actor?.name ?? 'System',
        action: r.action,
        entity: r.entity,
        entity_id: r.entity_id ?? '',
        subject: r.subject?.name ?? '',
        change: securityService.describeChange(r),
      })) as unknown as Record<string, unknown>[],
      [
        { key: 'at', label: 'When' },
        { key: 'actor', label: 'Who' },
        { key: 'action', label: 'Action' },
        { key: 'entity', label: 'Record type' },
        { key: 'entity_id', label: 'Record' },
        { key: 'subject', label: 'About' },
        { key: 'change', label: 'Change' },
      ],
    );
    return file(csv, `workspace-changes-${stamp}.csv`);
  }

  const rows = await securityService.listWorkspaceSignIns(db, { personId: person, limit: 5000 });
  const csv = toCsv(
    rows.map((r) => ({
      at: r.at,
      person: r.person?.name ?? '',
      result: r.succeeded ? 'Signed in' : 'Failed',
      client: r.client ?? '',
      device: r.device ?? '',
      time_zone: r.time_zone ?? '',
      ip: r.ip ?? '',
      user_agent: r.user_agent ?? '',
    })) as unknown as Record<string, unknown>[],
    [
      { key: 'at', label: 'When' },
      { key: 'person', label: 'Account' },
      { key: 'result', label: 'Result' },
      { key: 'client', label: 'App' },
      { key: 'device', label: 'Device' },
      { key: 'time_zone', label: 'Time zone (device reported)' },
      { key: 'ip', label: 'Address (as reported by the proxy)' },
      { key: 'user_agent', label: 'User agent' },
    ],
  );
  return file(csv, `workspace-sign-ins-${stamp}.csv`);
}

const file = (csv: string, name: string) => new Response(csv, {
  headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${name}"`,
    'Cache-Control': 'no-store',
  },
});
