// The policies an employer is expected to have in writing.
//
// The register is derived rather than maintained, so what is under test is
// whether it tells the truth as the underlying documents change — and whether
// the states it reports are the ones that matter. A register that says "in
// place" about a policy nobody has read is worse than no register: it is an
// answer somebody will rely on.
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
  if (!s.access_token) throw new Error(`login failed for ${email}: ${JSON.stringify(s)}`);
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
const sally = await login('sally@woodstockdigital.test');

const load = (who) => rest(who, 'policy_register?select=*&order=sort_order').then((r) => r.json());
const row = (rows, requirement) => rows.find((r) => r.requirement === requirement);

// ------------------------------------------------------------ the four states
let rows = await load(lucy);
check(rows.length === 7, 'every obligation is listed, met or not', `${rows.length}`);

check(row(rows, 'Right to disconnect')?.status === 'Not read by everybody',
  'a policy that must be read and has not been says so',
  row(rows, 'Right to disconnect')?.status);
check(row(rows, 'Preventing sexual harassment')?.status === 'Not required reading',
  'a policy nobody is required to read is not counted as covered',
  row(rows, 'Preventing sexual harassment')?.status);
check(row(rows, 'Privacy and personal information')?.status === 'No policy',
  'an obligation with nothing written against it is a gap',
  row(rows, 'Privacy and personal information')?.status);
check(row(rows, 'Privacy and personal information')?.outstanding === null,
  'and does not claim people have failed to read a document that does not exist',
  String(row(rows, 'Privacy and personal information')?.outstanding));

check(row(rows, 'Whistleblower protections')?.universal === false,
  'obligations that depend on size or structure are marked as such');
check(row(rows, 'Right to disconnect')?.universal === true,
  'and the ones that apply to everybody are not');

// -------------------------------------------------- reading changes the state
const policy = row(rows, 'Right to disconnect');

/*
 * Everybody reads it, each through their own session — a receipt can only be
 * written for yourself, so there is no shortcut here even in a test.
 *
 * The version is read at the moment of acknowledging rather than taken from
 * the register loaded earlier, for the same reason the app does it: the
 * receipt has to name the version actually in force.
 */
async function acknowledge(who) {
  const [doc] = await rest(who, `documents?select=version&id=eq.${policy.document_id}`)
    .then((r) => r.json());
  return rest(who, 'document_acknowledgements', {
    method: 'POST',
    body: JSON.stringify({
      document_id: policy.document_id,
      user_id: who.id,
      organisation_id: ORG,
      version: doc.version,
    }),
  });
}

for (const email of ['charlie', 'schroeder', 'marcie', 'patty']) {
  const who = await login(`${email}@peanutsstudio.test`);
  const wrote = await acknowledge(who);
  if (wrote.status >= 400) check(false, `${email} could record a read receipt`, `status ${wrote.status}`);
}
await acknowledge(lucy);

rows = await load(lucy);
check(row(rows, 'Right to disconnect')?.status === 'In place',
  'once everybody has read it, the obligation reads as met',
  `${row(rows, 'Right to disconnect')?.acknowledged} of ${row(rows, 'Right to disconnect')?.headcount}`);

// ----------------------------------------------- re-issuing retires the proof
//
// This is the whole reason read receipts are versioned. A policy that has been
// rewritten has not been read by anybody, whatever last month's register said.
await rest(lucy, `documents?id=eq.${policy.document_id}`, {
  method: 'PATCH', body: JSON.stringify({ storage_path: `${ORG}/shared/studio-policies-v2.pdf` }),
});
rows = await load(lucy);
check(row(rows, 'Right to disconnect')?.version === 2, 'a re-issued policy is a new version',
  String(row(rows, 'Right to disconnect')?.version));
check(row(rows, 'Right to disconnect')?.status === 'Not read by everybody',
  'and stops counting as read, rather than staying green on last version\'s receipts',
  row(rows, 'Right to disconnect')?.status);

// ------------------------------------------------------------- the claim
const twoClaims = await rest(lucy, `documents?id=eq.${row(rows, 'Preventing sexual harassment').document_id}`, {
  method: 'PATCH', body: JSON.stringify({ satisfies_policy: 'Right to disconnect' }),
});
check(twoClaims.status >= 400, 'two documents cannot both be the same policy',
  `status ${twoClaims.status}`);

const [personal] = await rest(lucy, 'documents', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, owner_id: '11111111-1111-1111-1111-000000000002', uploaded_by: lucy.id,
    name: 'Policy check personal', category: 'HR Documents',
    storage_path: `${ORG}/personal/policy-check.pdf`,
  }),
}).then((r) => r.json());
const personalClaim = await rest(lucy, `documents?id=eq.${personal.id}`, {
  method: 'PATCH', body: JSON.stringify({ satisfies_policy: 'Privacy and personal information' }),
});
check(personalClaim.status >= 400, 'and somebody\'s personal file cannot be a workplace policy',
  `status ${personalClaim.status}`);

// --------------------------------------------------------------- who sees it
const asEmployee = await load(charlie);
check(asEmployee.length === 7,
  'an employee can see what the workplace is supposed to have written down');

const claimAsEmployee = await rest(charlie, `documents?id=eq.${policy.document_id}`, {
  method: 'PATCH', body: JSON.stringify({ satisfies_policy: null }),
});
const stillClaimed = await load(lucy);
check(row(stillClaimed, 'Right to disconnect')?.document_id === policy.document_id,
  'but cannot decide which document answers an obligation',
  `status ${claimAsEmployee.status}`);

const otherWorkspace = await load(sally);
check(otherWorkspace.every((r) => r.organisation_id !== ORG),
  'and another workspace sees its own register, not this one',
  JSON.stringify(otherWorkspace.map((r) => r.organisation_id).slice(0, 2)));
check(row(otherWorkspace, 'Right to disconnect')?.status === 'No policy',
  'which has its own gaps', row(otherWorkspace, 'Right to disconnect')?.status);

process.exit(bad === 0 ? 0 : 1);
