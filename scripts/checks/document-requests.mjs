// HR uploads an unsigned contract, the employee returns it signed, and both
// sides keep a copy. Plus the checklists and automation that stop this being
// eight manual requests per new starter.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const API = 'http://127.0.0.1:54321';
const ORG = 'aaaaaaaa-0000-0000-0000-000000000001';

let bad = 0;
const check = (ok, label, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
};

async function login(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'snoopy123' }),
  });
  const s = await r.json();
  if (!s.access_token) throw new Error(`login failed for ${email}`);
  return { token: s.access_token, id: s.user.id };
}

const rest = (who) => async (path, init = {}) => {
  const res = await fetch(`${API}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON, Authorization: `Bearer ${who.token}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const rpc = (who, fn, args) => fetch(`${API}/rest/v1/rpc/${fn}`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(args),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const lucy = await login('lucy@peanutsstudio.test');       // admin
const patty = await login('patty@peanutsstudio.test');     // owes paperwork
const schroeder = await login('schroeder@peanutsstudio.test'); // Patty's manager
const charlie = await login('charlie@peanutsstudio.test');     // unrelated

const asLucy = rest(lucy);
const asPatty = rest(patty);
const asSchroeder = rest(schroeder);
const asCharlie = rest(charlie);
const stamp = Date.now();

// ---- HR uploads the unsigned contract and asks for it back
const template = await asLucy('documents', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, name: `Unsigned contract ${stamp}`, category: 'HR Documents',
    storage_path: `templates/contract-${stamp}.pdf`, uploaded_by: lucy.id, owner_id: null,
  }),
});
const templateId = template.body?.[0]?.id;
check(Boolean(templateId), 'HR can upload the document to be signed');

const request = await asLucy('document_requests', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, employee_id: patty.id, requested_by: lucy.id,
    title: `Signed contract ${stamp}`, instructions: 'Sign and return.',
    template_document_id: templateId, due_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
  }),
});
const requestId = request.body?.[0]?.id;
check(Boolean(requestId), 'HR can request it from a named person');
check(request.body?.[0]?.status === 'Requested', 'it starts as outstanding');

// ---- the employee sees it, and nobody else's
const pattySees = await asPatty(`document_requests?select=id,title,template_document_id&id=eq.${requestId}`);
check((pattySees.body ?? []).length === 1, 'the employee sees what is asked of them');
check(pattySees.body?.[0]?.template_document_id === templateId, 'the file to sign is attached to the request');

const nosy = await asCharlie(`document_requests?select=id&id=eq.${requestId}`);
check((nosy.body ?? []).length === 0, 'an unrelated colleague sees nothing');

const managerSees = await asSchroeder(`document_requests?select=id&id=eq.${requestId}`);
check((managerSees.body ?? []).length === 1, "the employee's manager can see it");

// ---- the employee returns the signed copy
const signed = await asPatty('documents', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, name: `Signed contract ${stamp}`, category: 'HR Documents',
    storage_path: `${ORG}/${patty.id}/signed-${stamp}.pdf`, uploaded_by: patty.id, owner_id: patty.id,
  }),
});
const signedId = signed.body?.[0]?.id;
check(Boolean(signedId), 'the employee can upload the signed copy', JSON.stringify(signed.body).slice(0, 100));

const submitted = await asPatty(`document_requests?id=eq.${requestId}`, {
  method: 'PATCH', body: JSON.stringify({ submitted_document_id: signedId }),
});
check(submitted.body?.[0]?.status === 'Submitted', 'returning it marks the request submitted',
  submitted.body?.[0]?.status);
check(Boolean(submitted.body?.[0]?.submitted_at), 'the moment it was returned is recorded');

// An employee returns work; they do not decide the outcome.
const selfAccept = await asPatty(`document_requests?id=eq.${requestId}`, {
  method: 'PATCH', body: JSON.stringify({ status: 'Accepted', review_note: 'looks fine to me' }),
});
check(selfAccept.body?.[0]?.status !== 'Accepted', 'an employee cannot accept their own submission',
  selfAccept.body?.[0]?.status);
check(!selfAccept.body?.[0]?.review_note, 'nor write the review note');

// Nor move their own deadline or retitle the request.
const meddle = await asPatty(`document_requests?id=eq.${requestId}`, {
  method: 'PATCH', body: JSON.stringify({ due_date: '2031-01-01', title: 'Something else' }),
});
check(meddle.body?.[0]?.title === `Signed contract ${stamp}`, 'an employee cannot rewrite the request');
check(meddle.body?.[0]?.due_date !== '2031-01-01', 'nor move their own deadline');

// ---- HR reviews it, and both sides keep a copy
const sentBack = await asLucy(`document_requests?id=eq.${requestId}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'Returned', reviewed_by: lucy.id, review_note: 'Page 3 is unsigned.' }),
});
check(sentBack.body?.[0]?.status === 'Returned', 'HR can send it back with a reason');
check(sentBack.body?.[0]?.review_note === 'Page 3 is unsigned.', 'the reason is kept for next time');

const accepted = await asLucy(`document_requests?id=eq.${requestId}`, {
  method: 'PATCH', body: JSON.stringify({ status: 'Accepted', reviewed_by: lucy.id }),
});
check(accepted.body?.[0]?.status === 'Accepted', 'and accept it once it is right');

const employeeCopy = await asPatty(`documents?select=id&id=eq.${signedId}`);
check((employeeCopy.body ?? []).length === 1, 'the employee keeps their own signed copy');
const hrCopy = await asLucy(`documents?select=id&id=eq.${signedId}`);
check((hrCopy.body ?? []).length === 1, 'HR keeps a copy for the record');
const managerCopy = await asSchroeder(`documents?select=id&id=eq.${signedId}`);
check((managerCopy.body ?? []).length === 1, "the manager can read their report's returned file");
const strangerCopy = await asCharlie(`documents?select=id&id=eq.${signedId}`);
check((strangerCopy.body ?? []).length === 0, 'an unrelated colleague cannot');

// ---- checklists
const checklists = await asLucy('document_checklists?select=id,name,kind');
check((checklists.body ?? []).length >= 2, 'several named checklists can exist');
check(
  new Set((checklists.body ?? []).map((c) => c.kind)).size > 1,
  'joining and leaving packs are distinguishable',
);

const pack = (checklists.body ?? []).find((c) => c.name === 'New Starter Pack');
const applied = await rpc(lucy, 'apply_document_checklist', {
  checklist: pack.id, employee: charlie.id,
  start_date: new Date().toISOString().slice(0, 10),
});
check(typeof applied.body === 'number' && applied.body > 0, 'a checklist raises every request at once',
  JSON.stringify(applied.body));

const again = await rpc(lucy, 'apply_document_checklist', { checklist: pack.id, employee: charlie.id });
check(again.body === 0, 're-applying adds nothing that is already outstanding', String(again.body));

const employeeApplies = await rpc(patty, 'apply_document_checklist', { checklist: pack.id, employee: patty.id });
check(employeeApplies.status >= 400, 'an employee cannot raise requests against anyone', String(employeeApplies.status));

// ---- automation is per team, and more than one can exist
const automations = await asLucy('checklist_automations?select=checklist_id,department_id');
check((automations.body ?? []).length >= 2, 'more than one automation can be configured');
check(
  (automations.body ?? []).some((a) => a.department_id === null)
    && (automations.body ?? []).some((a) => a.department_id !== null),
  'automations cover both the whole workspace and single teams',
);

// ---- save what was asked of one person as a reusable checklist
const saved = await rpc(lucy, 'save_requests_as_checklist', {
  employee: charlie.id, checklist_name: `Captured pack ${stamp}`, checklist_kind: 'Onboarding',
});
check(typeof saved.body === 'string', 'a set of requests can be kept as a checklist', JSON.stringify(saved.body).slice(0, 80));

const savedItems = await asLucy(`document_checklist_items?select=title&checklist_id=eq.${saved.body}`);
check((savedItems.body ?? []).length > 0, 'the captured checklist carries the items', `${(savedItems.body ?? []).length} items`);

// ---- authoring: create, edit and delete a checklist the way the editor does
const authored = await asLucy('document_checklists', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, name: `Authored pack ${stamp}`, kind: 'Onboarding',
    description: 'Written through the editor.', created_by: lucy.id,
  }),
});
const authoredId = authored.body?.[0]?.id;
check(Boolean(authoredId), 'a checklist can be authored');

const withItems = await asLucy('document_checklist_items', {
  method: 'POST',
  // Every object carries the same keys: PostgREST refuses a bulk insert whose
  // rows differ in shape, which is why the service always builds them uniformly.
  body: JSON.stringify([
    { organisation_id: ORG, checklist_id: authoredId, title: 'Signed agreement',
      instructions: 'Sign and return.', due_after_days: 3, sort_order: 0 },
    { organisation_id: ORG, checklist_id: authoredId, title: 'Photo identification',
      instructions: null, due_after_days: 5, sort_order: 1 },
  ]),
});
check((withItems.body ?? []).length === 2, 'its documents are saved with it',
  `status ${withItems.status}: ${JSON.stringify(withItems.body).slice(0, 160)}`);

// The editor replaces the whole list rather than patching item by item.
await asLucy(`document_checklist_items?checklist_id=eq.${authoredId}`, { method: 'DELETE' });
const replaced = await asLucy('document_checklist_items', {
  method: 'POST',
  body: JSON.stringify([
    { organisation_id: ORG, checklist_id: authoredId, title: 'Signed agreement',
      due_after_days: 3, sort_order: 0 },
  ]),
});
check((replaced.body ?? []).length === 1, 'editing replaces the list wholesale');

// An automation can be attached and removed without touching the checklist.
const rule = await asLucy('checklist_automations', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, checklist_id: authoredId, department_id: null, created_by: lucy.id,
  }),
});
check((rule.body ?? []).length === 1, 'a rule can be attached to it');

const removedRule = await asLucy(`checklist_automations?id=eq.${rule.body?.[0]?.id}`, { method: 'DELETE' });
check((removedRule.body ?? []).length === 1, 'and removed again');

// An employee may read checklists but never author one.
const employeeAuthors = await asPatty('document_checklists', {
  method: 'POST',
  body: JSON.stringify({ organisation_id: ORG, name: 'Nope', kind: 'Onboarding' }),
});
check(employeeAuthors.status >= 400 || (employeeAuthors.body ?? []).length === 0,
  'an employee cannot author a checklist', String(employeeAuthors.status));

await asLucy(`document_checklists?id=eq.${authoredId}`, { method: 'DELETE' });
const gone = await asLucy(`document_checklist_items?select=id&checklist_id=eq.${authoredId}`);
check((gone.body ?? []).length === 0, 'deleting a checklist takes its documents with it');

// ---- cleanup
await asLucy(`document_checklists?id=eq.${saved.body}`, { method: 'DELETE' });
await asLucy(`document_requests?employee_id=eq.${charlie.id}`, { method: 'DELETE' });
await asLucy(`document_requests?id=eq.${requestId}`, { method: 'DELETE' });
await asLucy(`documents?id=eq.${templateId}`, { method: 'DELETE' });
await asLucy(`documents?id=eq.${signedId}`, { method: 'DELETE' });

process.exit(bad ? 1 : 0);
