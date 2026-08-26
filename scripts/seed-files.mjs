// Put a real file behind every document.
//
// Rows in `documents` name a storage path; nothing guaranteed anything was
// there. In the demo workspace nothing ever was, so Preview said "Object not
// found", the access log recorded reads of nothing, and the seven-year
// retention protected nothing. A workspace whose documents are placeholders
// demonstrates a filing cabinet rather than being one.
//
// This walks every document, works out what it should say from what the row
// already knows — an employment agreement carries that person's particulars, a
// policy carries the obligation it claims to satisfy — and uploads a real PDF.
// It skips anything that already has a file, so it is safe to run repeatedly
// and after a reset.
//
//   node scripts/seed-files.mjs [--force]
import { createClient } from '@supabase/supabase-js';
// Imported module by module with explicit extensions: Node strips types but
// does not resolve extensionless specifiers, and the package barrel is written
// for a bundler.
import * as documentContent from '../packages/shared/src/services/document-content.ts';
import { buildPdf } from '../packages/shared/src/services/documents-pdf.ts';

const money = (cents) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100);

process.loadEnvFile('apps/desktop/.env.local');

const force = process.argv.includes('--force');
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const BUCKET = 'documents';

/** What this document should contain, from what the row already tells us. */
function contentFor(doc, owner, organisation) {
  if (doc.satisfies_policy) {
    const policy = documentContent.policyDocument(doc.satisfies_policy);
    if (policy) return policy;
  }
  if (/agreement|contract/i.test(doc.name) && owner) {
    return documentContent.employmentAgreement({
      name: owner.name,
      jobTitle: owner.job_title,
      startDate: owner.start_date,
      employmentHours: owner.employment_hours,
      employmentBasis: owner.employment_basis,
      organisation,
    });
  }
  if (/handbook/i.test(doc.name)) return documentContent.handbook(organisation);
  return documentContent.generic(doc.name, doc.description, doc.category);
}

const { data: organisations } = await db.from('organisations').select('id, name');
const orgName = new Map((organisations ?? []).map((o) => [o.id, o.name]));

const { data: documents, error } = await db
  .from('documents')
  .select('id, organisation_id, owner_id, name, description, category, storage_path, satisfies_policy, file_type');
if (error) throw error;

let written = 0;
let skipped = 0;

for (const doc of documents ?? []) {
  const folder = doc.storage_path.split('/').slice(0, -1).join('/');
  const file = doc.storage_path.split('/').pop();

  if (!force) {
    const { data: existing } = await db.storage.from(BUCKET).list(folder, { search: file });
    if ((existing ?? []).some((f) => f.name === file)) { skipped += 1; continue; }
  }

  let owner = null;
  if (doc.owner_id) {
    const { data } = await db
      .from('profiles')
      .select('name, job_title, start_date, employment_hours, employment_basis')
      .eq('id', doc.owner_id).single();
    owner = data;
  }

  const pdf = await buildPdf(
    contentFor(doc, owner, orgName.get(doc.organisation_id) ?? 'This workspace'),
  );

  const { error: uploadError } = await db.storage.from(BUCKET).upload(doc.storage_path, pdf, {
    contentType: 'application/pdf', upsert: true,
  });
  if (uploadError) {
    console.error(`  could not write ${doc.storage_path}: ${uploadError.message}`);
    continue;
  }
  // The row may claim a type it never had a file for.
  if (doc.file_type !== 'application/pdf') {
    await db.from('documents').update({ file_type: 'application/pdf' }).eq('id', doc.id);
  }
  written += 1;
  console.log(`  ${doc.name} -> ${doc.storage_path}`);
}

/*
 * Pay slips for anything already marked as issued.
 *
 * The seed marks some slips as having gone out, which before this produced the
 * same nothing: a timestamp saying a document was issued, and no document. A
 * pay slip is the one people actually need a copy of.
 */
const { data: issued } = await db
  .from('pay_obligations').select('*').not('slip_issued_at', 'is', null);

for (const record of issued ?? []) {
  const path = `${record.organisation_id}/${record.employee_id}/pay-slip-${record.starts_on}.pdf`;
  const { data: already } = await db.storage.from(BUCKET)
    .list(path.split('/').slice(0, -1).join('/'), { search: path.split('/').pop() });
  if (!force && (already ?? []).length > 0) { skipped += 1; continue; }

  const pdf = await buildPdf(documentContent.paySlip(record, money));
  await db.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: true });

  const { data: row } = await db.from('documents').select('id').eq('storage_path', path).maybeSingle();
  if (!row) {
    await db.from('documents').insert({
      organisation_id: record.organisation_id,
      owner_id: record.employee_id,
      name: `Pay slip ${record.starts_on} to ${record.ends_on}`,
      storage_path: path,
      category: 'HR Documents',
      file_type: 'application/pdf',
      description: `Pay slip for the period ending ${record.ends_on}.`,
    });
  }
  written += 1;
  console.log(`  Pay slip for ${record.employee_name} -> ${path}`);
}

console.log(`\n${written} written, ${skipped} already had a file.`);
