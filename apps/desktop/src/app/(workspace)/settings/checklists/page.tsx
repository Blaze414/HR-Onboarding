import Link from 'next/link';
import { acknowledgementService, documentRequestService, employeeService } from '@snoopy/shared';
import { AutomationEditor, RemoveAutomation } from '@/components/AutomationEditor';
import { ChecklistEditor } from '@/components/ChecklistEditor';
import { EmptyState, PageHead, StatusBadge, TableCard } from '@/components/ui';
import { requireCapability } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * The paperwork a joiner or leaver has to return, stated once.
 *
 * Two things live here because they are one decision: what the pack contains,
 * and who gets it automatically. Splitting them across screens would mean
 * building a checklist and then remembering to switch it on.
 */
export default async function ChecklistsPage() {
  await requireCapability('document.request');
  const db = await getServerSupabase();

  const [checklists, automations, departments, signables] = await Promise.all([
    documentRequestService.listChecklists(db),
    documentRequestService.listAutomations(db),
    employeeService.listDepartments(db),
    // Only shared documents can be handed out to sign; a personal file belongs
    // to one person and cannot be a template for everybody.
    acknowledgementService.requiringAcknowledgement(db).catch(() => []),
  ]);

  const sharedDocuments = await db
    .from('documents')
    .select('id,name')
    .is('owner_id', null)
    .order('name')
    .then((r) => (r.data ?? []) as { id: string; name: string }[]);

  return (
    <>
      <PageHead
        title="Document checklists"
        subtitle="What a joiner or leaver has to return, and who is asked for it automatically."
        actions={<ChecklistEditor templates={sharedDocuments} />}
      />

      <TableCard title="Checklists">
        <table className="table">
          <thead>
            <tr><th>Checklist</th><th>Used for</th><th className="num">Documents</th><th /></tr>
          </thead>
          <tbody>
            {checklists.map((c: any) => (
              <tr key={c.id}>
                <td>
                  <span style={{ fontWeight: 560 }}>{c.name}</span>
                  {c.description ? (
                    <div className="subtle truncate" style={{ maxWidth: 420 }}>{c.description}</div>
                  ) : null}
                </td>
                <td><StatusBadge status={c.kind === 'Offboarding' ? 'Leaving' : 'Joining'} /></td>
                <td className="num">{c.items?.length ?? 0}</td>
                <td className="actions">
                  <ChecklistEditor checklist={c} templates={sharedDocuments} trigger="Edit" />
                </td>
              </tr>
            ))}
            {checklists.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <EmptyState message="No checklists yet. One pack, stated once, saves asking for the same eight things every time." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableCard>

      <TableCard
        title="Raised automatically"
        action={
          <AutomationEditor
            checklists={checklists.map((c: any) => ({ id: c.id, name: c.name, kind: c.kind }))}
            departments={departments.map((d) => ({ id: d.id, name: d.name }))}
          />
        }
      >
        <table className="table">
          <thead><tr><th>Checklist</th><th>Applies to</th><th /></tr></thead>
          <tbody>
            {automations.map((a: any) => (
              <tr key={a.id}>
                <td style={{ fontWeight: 560 }}>{a.checklist?.name}</td>
                <td className="subtle">
                  {a.department?.name ? `Only ${a.department.name}` : 'Everyone added to the workspace'}
                </td>
                <td className="actions">
                  <RemoveAutomation id={a.id} label={a.checklist?.name ?? 'this checklist'} />
                </td>
              </tr>
            ))}
            {automations.length === 0 ? (
              <tr>
                <td colSpan={3}>
                  <EmptyState message="Nothing is raised automatically. Without a rule, somebody has to remember on the day." />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableCard>

      <p className="muted" style={{ fontSize: 13 }}>
        <Link className="link" href="/settings">Back to settings</Link>
      </p>
    </>
  );
}
