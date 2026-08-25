// A read receipt is about a version, not a document.
//
// The failure this guards against: a policy is replaced, every old receipt
// stays valid, and the report says the workplace has read something nobody has
// seen. These checks prove that replacing the file retires the receipts, puts
// everybody back in the outstanding list, tells them, and keeps the old receipt
// as history rather than deleting it.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const API = 'http://127.0.0.1:54321';

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

const rest = (who, path, init = {}) => fetch(`${API}/rest/v1/${path}`, {
  ...init,
  headers: {
    apikey: ANON, Authorization: `Bearer ${who.token}`,
    'Content-Type': 'application/json', Prefer: 'return=representation',
    ...init.headers,
  },
});

const lucy = await login('lucy@peanutsstudio.test');
const charlie = await login('charlie@peanutsstudio.test');
const ORG = 'aaaaaaaa-0000-0000-0000-000000000001';

// ------------------------------------------------------------ a policy exists
const created = await rest(lucy, 'documents', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, owner_id: null, uploaded_by: lucy.id,
    name: 'Version check policy', category: 'Policies',
    storage_path: `${ORG}/shared/version-check-v1.pdf`,
    requires_acknowledgement: true,
  }),
}).then((r) => r.json());
const doc = created?.[0];
check(doc?.version === 1, 'a new document starts at version 1', JSON.stringify(created).slice(0, 140));

// ------------------------------------------------------------ somebody reads it
await rest(charlie, 'document_acknowledgements', {
  method: 'POST',
  body: JSON.stringify({ document_id: doc.id, user_id: charlie.id, organisation_id: ORG, version: 1 }),
});
const owedBefore = await rest(lucy, `outstanding_acknowledgements?select=employee_id&document_id=eq.${doc.id}`)
  .then((r) => r.json());
check(
  !owedBefore.some((row) => row.employee_id === charlie.id),
  'after reading it, they no longer owe one',
);

// ------------------------------------------------------------ the version bump
const replaced = await rest(lucy, `documents?id=eq.${doc.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ storage_path: `${ORG}/shared/version-check-v2.pdf` }),
}).then((r) => r.json());
check(replaced?.[0]?.version === 2, 'replacing the file bumps the version', JSON.stringify(replaced?.[0]?.version));

const renamed = await rest(lucy, `documents?id=eq.${doc.id}`, {
  method: 'PATCH', body: JSON.stringify({ name: 'Version check policy (renamed)' }),
}).then((r) => r.json());
check(renamed?.[0]?.version === 2, 'an ordinary edit does not bump it');

// The client cannot set it directly — this is the column guard, not a policy.
const forged = await rest(lucy, `documents?id=eq.${doc.id}`, {
  method: 'PATCH', body: JSON.stringify({ version: 99 }),
}).then((r) => r.json());
check(forged?.[0]?.version === 2, 'nobody can set the version by hand', String(forged?.[0]?.version));

// ------------------------------------------------------------ the point of it all
const owedAfter = await rest(lucy, `outstanding_acknowledgements?select=employee_id,document_version&document_id=eq.${doc.id}`)
  .then((r) => r.json());
check(
  owedAfter.some((row) => row.employee_id === charlie.id),
  'a new version puts the reader back in the outstanding list',
);
check(owedAfter[0]?.document_version === 2, 'the outstanding row names the version owed');

// The old receipt survives: it is a fact about a moment, not a flag.
const receipts = await rest(charlie, `document_acknowledgements?select=version&document_id=eq.${doc.id}`)
  .then((r) => r.json());
check(
  receipts.length === 1 && receipts[0].version === 1,
  'the old receipt is kept as history, not deleted',
  JSON.stringify(receipts),
);

// ------------------------------------------------------------ people are told
const told = await rest(charlie, `notifications?select=id,title&entity_id=eq.${doc.id}`).then((r) => r.json());
check(told.length === 1, 'everybody who owes one is told the version changed', JSON.stringify(told).slice(0, 120));
check(
  /has been updated/.test(told[0]?.title ?? ''),
  'the notification says what happened',
  told[0]?.title,
);

const toldSelf = await rest(lucy, `notifications?select=id&entity_id=eq.${doc.id}&user_id=eq.${lucy.id}`)
  .then((r) => r.json());
check(toldSelf.length === 0, 'whoever replaced it is not told about their own change');

// ------------------------------------------------------------ reading it again
await rest(charlie, 'document_acknowledgements', {
  method: 'POST',
  body: JSON.stringify({ document_id: doc.id, user_id: charlie.id, organisation_id: ORG, version: 2 }),
});
const owedFinally = await rest(lucy, `outstanding_acknowledgements?select=employee_id&document_id=eq.${doc.id}`)
  .then((r) => r.json());
check(
  !owedFinally.some((row) => row.employee_id === charlie.id),
  'reading the new version clears it again',
);

// ------------------------------------------------------------ tidy up
await rest(lucy, `documents?id=eq.${doc.id}`, { method: 'DELETE' });
const left = await rest(lucy, `documents?select=id&id=eq.${doc.id}`).then((r) => r.json());
check(left.length === 0, 'fixtures restored');

console.log(bad === 0 ? '\nAll policy version checks passed.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
