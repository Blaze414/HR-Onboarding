// Optional credentials, and the rostering question they exist to answer.
// A record that cannot be re-checked, or that counts while expired, is worse
// than no record — it is a wrong answer delivered confidently.
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

const lucy = await login('lucy@peanutsstudio.test');
const charlie = await login('charlie@peanutsstudio.test');
const patty = await login('patty@peanutsstudio.test');
const asLucy = rest(lucy); const asCharlie = rest(charlie); const asPatty = rest(patty);
const stamp = Date.now();

// ---- anyone can offer a credential nobody asked for
const offered = await asCharlie('employee_credentials', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, employee_id: charlie.id, title: `Forklift licence ${stamp}`,
    issuer: 'Roads Authority', reference_number: 'FL-99120', jurisdiction: 'New South Wales',
    expires_on: new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10),
  }),
});
const credentialId = offered.body?.[0]?.id;
check(Boolean(credentialId), 'anyone can offer a credential unprompted', JSON.stringify(offered.body).slice(0, 120));
check(offered.body?.[0]?.status === 'Pending', 'it starts as a claim, not as fact');

// Submitting something that already looks checked must not work either.
const preVerified = await asCharlie('employee_credentials', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, employee_id: charlie.id, title: `Pre-verified ${stamp}`,
    status: 'Verified', verification_method: 'Original sighted', original_sighted: true,
  }),
});
check(preVerified.body?.[0]?.status === 'Pending',
  'a credential cannot be submitted already verified', preVerified.body?.[0]?.status);
await asLucy(`employee_credentials?id=eq.${preVerified.body?.[0]?.id}`, { method: 'DELETE' });

// ---- a claim is not cover
const beforeVerify = await asLucy(`department_coverage?select=employee_id&employee_id=eq.${charlie.id}`);
const pendingCounts = (beforeVerify.body ?? []).length;

// ---- the person cannot check their own
const selfVerify = await asCharlie(`employee_credentials?id=eq.${credentialId}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'Verified', verification_method: 'I promise' }),
});
check(selfVerify.body?.[0]?.status !== 'Verified', 'nobody can verify their own credential',
  selfVerify.body?.[0]?.status);

// The subject of a record cannot write the verifier's account of checking it.
const forgedMethod = await asCharlie(`employee_credentials?id=eq.${credentialId}`, {
  method: 'PATCH',
  body: JSON.stringify({ verification_method: 'Original sighted', original_sighted: true }),
});
check(!forgedMethod.body?.[0]?.verification_method,
  'the subject cannot write how their credential was checked',
  String(forgedMethod.body?.[0]?.verification_method));
check(forgedMethod.body?.[0]?.original_sighted === false,
  'nor claim the original was seen');

// ---- a verifier must say how they checked
const vague = await asLucy(`employee_credentials?id=eq.${credentialId}`, {
  method: 'PATCH', body: JSON.stringify({ status: 'Verified', verified_by: lucy.id }),
});
check(vague.status >= 400, 'verifying without recording the method is refused', `status ${vague.status}`);

const proper = await asLucy(`employee_credentials?id=eq.${credentialId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    status: 'Verified', verified_by: lucy.id, verified_at: new Date().toISOString(),
    verification_method: 'Original sighted', original_sighted: true,
  }),
});
check(proper.body?.[0]?.status === 'Verified', 'verifying with a method recorded is accepted',
  JSON.stringify(proper.body).slice(0, 120));

// ---- editing the substance withdraws the verdict
const edited = await asCharlie(`employee_credentials?id=eq.${credentialId}`, {
  method: 'PATCH', body: JSON.stringify({ expires_on: '2032-01-01' }),
});
check(edited.body?.[0]?.status === 'Pending',
  'changing the details of a checked credential un-checks it', edited.body?.[0]?.status);
check(!edited.body?.[0]?.verified_at, 'and clears who checked it');

// ---- coverage answers the rostering question
const coverage = await asLucy('department_coverage?select=*');
check((coverage.body ?? []).length > 0, 'coverage lists who could work elsewhere');
check(
  (coverage.body ?? []).every((r) => r.home_department !== r.department_name),
  'it excludes the department somebody already works in',
);
check(
  (coverage.body ?? []).every((r) => r.expires_on === null || new Date(r.expires_on) >= new Date(new Date().toDateString())),
  'an expired credential is not cover',
);

// A pending credential must never appear as cover.
const pendingRows = await asLucy(`employee_credentials?select=id,status&status=eq.Pending`);
const pendingIds = new Set((pendingRows.body ?? []).map((r) => r.id));
check(pendingIds.size > 0, 'there is a pending credential to test with');
const coverageTitles = new Set((coverage.body ?? []).map((r) => r.credential_title));
const pendingTitles = await asLucy('employee_credentials?select=title&status=eq.Pending')
  .then((r) => (r.body ?? []).map((x) => x.title));
check(
  pendingTitles.every((t) => !coverageTitles.has(t)),
  'an unchecked claim is never counted as cover',
  pendingTitles.filter((t) => coverageTitles.has(t)).join(', '),
);

// ---- required versus merely enabling
const required = await asLucy('credential_department_coverage?select=is_required&is_required=eq.true');
check((required.body ?? []).length > 0, 'a credential can be marked required for a department');

// ---- expiry is surfaced before it bites
const expiring = await asLucy('expiring_credentials?select=*');
check((expiring.body ?? []).length > 0, 'credentials nearing expiry are listed');
check(
  (expiring.body ?? []).every((r) => typeof r.days_left === 'number'),
  'each states how long is left',
);

// ---- privacy: a colleague cannot read somebody else's certificates
const nosy = await asPatty(`employee_credentials?select=id&employee_id=eq.${charlie.id}`);
check((nosy.body ?? []).length === 0, "a colleague cannot read another person's credentials",
  `${(nosy.body ?? []).length} rows`);

// ---- lapsing marks the record, rather than leaving a stale Verified stamp
const lapse = await asLucy(`employee_credentials?id=eq.${credentialId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    status: 'Verified', verified_by: lucy.id, verification_method: 'Original sighted',
    expires_on: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
  }),
});
const swept = await fetch(`${API}/rest/v1/rpc/expire_credentials`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${lucy.token}`, 'Content-Type': 'application/json' },
  body: '{}',
}).then((r) => r.json());
check(typeof swept === 'number' && swept >= 1, 'the sweep marks lapsed credentials expired', String(swept));

const after = await asLucy(`employee_credentials?select=status&id=eq.${credentialId}`);
check(after.body?.[0]?.status === 'Expired', 'the record no longer claims to be current',
  after.body?.[0]?.status);

// ---- an approval always carries when, and by whom
const stampProbe = await asCharlie('employee_credentials', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, employee_id: charlie.id, title: `Stamp probe ${stamp}`,
  }),
});
const stampId = stampProbe.body?.[0]?.id;

// Approving without supplying a time must not leave the record undated: the
// database stamps it rather than trusting every caller to remember.
const undated = await asLucy(`employee_credentials?id=eq.${stampId}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'Verified', verification_method: 'Original sighted' }),
});
check(Boolean(undated.body?.[0]?.verified_at), 'an approval is always dated, even when the caller forgets',
  String(undated.body?.[0]?.verified_at));
check(undated.body?.[0]?.verified_by === lucy.id, 'and records who made it',
  String(undated.body?.[0]?.verified_by));

// Withdrawing the approval must clear the stamp: a time left behind describes a
// decision that no longer stands.
const withdrawn = await asLucy(`employee_credentials?id=eq.${stampId}`, {
  method: 'PATCH', body: JSON.stringify({ status: 'Pending' }),
});
check(!withdrawn.body?.[0]?.verified_at, 'withdrawing an approval clears its timestamp',
  String(withdrawn.body?.[0]?.verified_at));

// The same for a returned document.
const reqProbe = await asLucy('document_requests', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, employee_id: charlie.id, requested_by: lucy.id,
    title: `Stamp request ${stamp}`,
  }),
});
const reqId = reqProbe.body?.[0]?.id;
const accepted = await asLucy(`document_requests?id=eq.${reqId}`, {
  method: 'PATCH', body: JSON.stringify({ status: 'Accepted' }),
});
check(Boolean(accepted.body?.[0]?.reviewed_at), 'accepting a document is dated automatically');
check(accepted.body?.[0]?.reviewed_by === lucy.id, 'and names who accepted it');

await asLucy(`document_requests?id=eq.${reqId}`, { method: 'DELETE' });
await asLucy(`employee_credentials?id=eq.${stampId}`, { method: 'DELETE' });

// Coverage carries the date the credential behind it was checked.
const stamped = await asLucy('department_coverage?select=verified_at,verified_by_name&limit=5');
check(
  (stamped.body ?? []).length > 0 && (stamped.body ?? []).every((r) => r.verified_at),
  'every row of cover states when it was checked',
);

// ---- managers check their own team, and only theirs
const schroeder = await login('schroeder@peanutsstudio.test'); // manages Patty, plain employee
const asSchroeder = rest(schroeder);

const pattyCredential = await asPatty('employee_credentials', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, employee_id: patty.id, title: `Barista certificate ${stamp}`,
    credential_type_id: null, issuer: 'Local college',
  }),
});
const pattyId = pattyCredential.body?.[0]?.id;
check(Boolean(pattyId), 'a report can offer a credential');

const managerChecks = await asSchroeder(`employee_credentials?id=eq.${pattyId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    status: 'Verified', verified_by: schroeder.id, verified_at: new Date().toISOString(),
    verification_method: 'Original sighted', original_sighted: true,
  }),
});
check(managerChecks.body?.[0]?.status === 'Verified',
  "a manager can check their own report's credential", JSON.stringify(managerChecks.body).slice(0, 120));

// Somebody else's report is not theirs to check.
const charlieCredential = await asCharlie('employee_credentials', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, employee_id: charlie.id, title: `Not yours ${stamp}`,
  }),
});
const charlieId = charlieCredential.body?.[0]?.id;
const outsideTeam = await asSchroeder(`employee_credentials?id=eq.${charlieId}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'Verified', verification_method: 'Original sighted' }),
});
check(
  !Array.isArray(outsideTeam.body) || outsideTeam.body.length === 0
    || outsideTeam.body[0].status !== 'Verified',
  'a manager cannot check somebody outside their team',
  JSON.stringify(outsideTeam.body).slice(0, 100),
);

// Sensitive kinds stay with HR: a manager has no business reading a
// colleague's identity documents to confirm an unrelated qualification.
const sensitiveType = await asLucy('credential_types?select=id&is_sensitive=eq.true&limit=1');
const sensitiveId = sensitiveType.body?.[0]?.id;
const sensitive = await asPatty('employee_credentials', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, employee_id: patty.id, credential_type_id: sensitiveId,
    title: `Sensitive ${stamp}`, expires_on: '2030-01-01',
  }),
});
const sensitiveCredentialId = sensitive.body?.[0]?.id;
const managerOnSensitive = await asSchroeder(`employee_credentials?id=eq.${sensitiveCredentialId}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'Verified', verification_method: 'Original sighted' }),
});
check(
  !Array.isArray(managerOnSensitive.body) || managerOnSensitive.body.length === 0
    || managerOnSensitive.body[0].status !== 'Verified',
  'a manager cannot check a sensitive kind — that stays with HR',
  JSON.stringify(managerOnSensitive.body).slice(0, 100),
);

const hrOnSensitive = await asLucy(`employee_credentials?id=eq.${sensitiveCredentialId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    status: 'Verified', verified_by: lucy.id, verification_method: 'Checked against the issuing register',
  }),
});
check(hrOnSensitive.body?.[0]?.status === 'Verified', 'HR still can');

await asLucy(`employee_credentials?id=eq.${pattyId}`, { method: 'DELETE' });
await asLucy(`employee_credentials?id=eq.${charlieId}`, { method: 'DELETE' });
await asLucy(`employee_credentials?id=eq.${sensitiveCredentialId}`, { method: 'DELETE' });

// ---- the approval reads as a sentence on the page
const page = await fetch('http://localhost:3100/profile', {
  headers: { cookie: `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(
    await fetch(`${API}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'charlie@peanutsstudio.test', password: 'snoopy123' }),
    }).then((r) => r.json()),
  )).toString('base64')}` },
}).then((r) => r.text()).catch(() => '');

if (page) {
  // React splits a JSX expression across text nodes with comment markers; strip
  // them to read the stamp the way somebody looking at the screen would.
  const plain = page.replace(/<!--[^>]*-->/g, '');
  const stamps = [...plain.matchAll(/class="stamp"[^>]*>(.*?)<\/span>/g)].map((m) => m[1].trim());
  check(stamps.length > 0, 'the approval date is shown on the page');
  check(
    stamps.every((t) => /^(Checked|Reviewed|Accepted|Sent back) (today|yesterday|\d+ days ago|on )/.test(t)),
    'it reads as a sentence rather than a raw timestamp',
    stamps[0],
  );
  check(stamps.some((t) => t.includes(' by ')), 'and names who decided it', stamps[0]);
}

// ---- cleanup
await asLucy(`employee_credentials?id=eq.${credentialId}`, { method: 'DELETE' });

process.exit(bad ? 1 : 0);
