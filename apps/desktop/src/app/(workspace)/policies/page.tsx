import Link from 'next/link';
import { documentService, formatDate, policyService } from '@snoopy/shared';
import { ClaimPolicy } from '@/components/ClaimPolicy';
import { EmptyState, PageHead, StatCard, StatusBadge, TableCard } from '@/components/ui';
import { requireCapability, sessionCan } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * What this workplace is expected to have written down.
 *
 * Not a checklist somebody maintains — a derived view. The obligations are
 * fixed reference data, and whether each is met comes from the documents that
 * claim them and the read receipts already recorded against the version in
 * force. A register that has to be updated by hand is true on the day it is
 * written and misleading thereafter.
 */
export default async function PoliciesPage() {
  const session = await requireCapability('document.view');
  const db = await getServerSupabase();
  const canManage = sessionCan(session, 'document.manage_shared');

  const [rows, shared] = await Promise.all([
    policyService.register(db),
    documentService.listDocuments(db, session.userId, { scope: 'shared' }),
  ]);
  const { inPlace, applicable } = policyService.coverage(rows);
  const unread = rows.filter((r) => r.status === 'Not read by everybody');

  return (
    <>
      <PageHead
        title="Workplace policies"
        subtitle="What an Australian employer is expected to have in writing, and whether this workspace has it."
      />

      <div className="stat-row">
        <StatCard label="In place" value={`${inPlace} of ${applicable}`} hint="Obligations that apply to every employer" />
        <StatCard label="Not read by everybody" value={unread.length} hint="A policy nobody has read is not a measure" />
        <StatCard label="Nothing written" value={rows.filter((r) => r.status === 'No policy' && r.universal).length} />
      </div>

      <TableCard title="The register">
        {rows.length === 0 ? <EmptyState message="No obligations listed." /> : (
          <table className="table">
            <thead>
              <tr>
                <th>Obligation</th><th>Policy</th><th>Read</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.requirement}>
                  <td>
                    <strong>{r.requirement}</strong>
                    <div className="subtle">{r.authority}</div>
                    <div className="subtle">{r.detail}</div>
                    {!r.universal ? (
                      /* Saying "missing" about an obligation that may not apply
                         is how a register trains people to ignore it. */
                      <div className="subtle">Check whether this applies to your organisation.</div>
                    ) : null}
                  </td>
                  <td>
                    {canManage ? (
                      <ClaimPolicy
                        requirement={r.requirement}
                        documentId={r.document_id}
                        documents={shared.map((d) => ({ id: d.id, name: d.name }))}
                      />
                    ) : (
                      r.document_name ?? <span className="subtle">—</span>
                    )}
                    {r.document_id ? (
                      <div className="subtle">
                        <Link href="/documents">Version {r.version}</Link> · published {formatDate(r.published_at)}
                      </div>
                    ) : null}
                  </td>
                  <td className="num">
                    {r.requires_acknowledgement
                      ? `${r.acknowledged} of ${r.headcount}`
                      : <span className="subtle">Not required</span>}
                  </td>
                  <td>
                    <StatusBadge status={r.status} />
                    {r.status === 'Not required reading' ? (
                      <div className="subtle">Turn on acknowledgement so there is evidence people saw it.</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>

      <p className="muted" style={{ marginTop: 16 }}>
        A re-issued policy retires the earlier read receipts, so a version nobody has
        acknowledged shows here as unread rather than as covered.
      </p>
    </>
  );
}
