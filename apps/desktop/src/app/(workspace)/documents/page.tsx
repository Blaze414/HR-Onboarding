import {
  acknowledgementService, DOCUMENT_CATEGORIES, documentRequestService, documentService,
  EMPTY_STATES, formatDate,
} from '@snoopy/shared';
import { AcknowledgeDocument } from '@/components/AcknowledgeDocument';
import { DocumentActions } from '@/components/DocumentActions';
import { DocumentRequests } from '@/components/DocumentRequests';
import { ClearFilters, SearchInput, SelectFilter } from '@/components/Filters';
import { UploadDocument } from '@/components/UploadDocument';
import { EmptyState, PageHead, StatusBadge, TableCard } from '@/components/ui';
import { requireCapability, sessionCan } from '@/lib/session';
import { getServerSupabase } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage({
  searchParams,
}: { searchParams: Promise<{ q?: string; category?: string; scope?: string }> }) {
  const { q, category, scope } = await searchParams;
  const session = await requireCapability('document.view');
  const db = await getServerSupabase();
  const isAdmin = session.profile.role === 'admin';

  const [documents, acknowledged] = await Promise.all([
    documentService.listDocuments(db, session.userId, {
      search: q,
      category: category ?? 'All',
      scope: (scope as any) ?? 'all',
    }),
    acknowledgementService.mine(db, session.userId),
  ]);

  const requests = await documentRequestService.mine(db, session.userId);

  // Anything the organisation requires you to read, that you have not, belongs
  // at the top: it is the only thing on this page that is asking something of
  // the reader rather than waiting to be searched for.
  const owed = documents.filter((d) => d.requires_acknowledgement && !acknowledged.has(d.id));

  return (
    <>
      <PageHead
        title="Documents"
        subtitle="Your personal files and the documents shared with the whole organisation."
        actions={
          <UploadDocument
            organisationId={session.organisationId}
            userId={session.userId}
            canUploadShared={sessionCan(session, 'document.manage_shared')}
            canUpload={sessionCan(session, 'document.upload_personal')}
          />
        }
      />

      <DocumentRequests
        requests={requests}
        organisationId={session.organisationId}
        employeeId={session.userId}
        canSubmit={sessionCan(session, 'document.submit')}
      />

      {owed.length > 0 ? (
        <div className="ack-prompt" role="status">
          <div>
            <strong>{owed.length} {owed.length === 1 ? 'document needs' : 'documents need'} your acknowledgement</strong>
            <span>Read {owed.length === 1 ? 'it' : 'them'} and confirm below. Your name and the time are recorded.</span>
          </div>
        </div>
      ) : null}

      <div className="toolbar">
        <SearchInput placeholder="Search documents…" />
        <SelectFilter
          name="scope" label="Owner" allLabel="All documents"
          options={[{ value: 'mine', label: 'My documents' }, { value: 'shared', label: 'Shared documents' }]}
        />
        <SelectFilter
          name="category" label="Category" allLabel="Any category"
          options={DOCUMENT_CATEGORIES.map((c) => ({ value: c, label: c }))}
        />
        <ClearFilters />
      </div>

      <TableCard>
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Category</th><th>Owner</th><th>Added</th><th>Acknowledgement</th><th /></tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id}>
                <td>
                  <span style={{ fontWeight: 560 }}>{d.name}</span>
                  {d.description ? <div className="subtle truncate" style={{ maxWidth: 340 }}>{d.description}</div> : null}
                </td>
                <td><StatusBadge status={d.category} /></td>
                <td className="subtle">{d.owner_id === null ? 'Organisation' : d.owner?.name ?? '—'}</td>
                <td className="subtle nowrap">{formatDate(d.created_at)}</td>
                <td>
                  {d.requires_acknowledgement ? (
                    <AcknowledgeDocument documentId={d.id} acknowledged={acknowledged.has(d.id)} />
                  ) : (
                    <span className="subtle">Not required</span>
                  )}
                </td>
                <td className="actions">
                  <DocumentActions doc={d} canDelete={d.owner_id === session.userId || isAdmin} />
                </td>
              </tr>
            ))}
            {documents.length === 0 ? (
              <tr><td colSpan={6}><EmptyState message={EMPTY_STATES.documents} /></td></tr>
            ) : null}
          </tbody>
        </table>
      </TableCard>
    </>
  );
}
