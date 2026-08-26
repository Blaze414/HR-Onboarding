// Contractors, and the small business employer threshold.
//
// The threshold is not trivia: it decides whether a casual waits six months or
// twelve before they may ask to go permanent, and which schedule their
// information statement runs on. It was being answered by counting rows, which
// is the rough shape of s.23 and wrong in three specific ways — it counted
// contractors, who are not employees; it counted every casual, where the Act
// counts only those employed on a regular and systematic basis; and it ignored
// associated entities entirely.
//
// What is tested is that the answer moves when the facts move, that the things
// the Act does not count are not counted, and that changing it changes what the
// workspace owes people rather than just a label on a settings page.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const API = 'http://127.0.0.1:54321';
const ORG = 'aaaaaaaa-0000-0000-0000-000000000001';
const MARCIE = '11111111-1111-1111-1111-000000000004'; // contractor in the seed
const PATTY = '11111111-1111-1111-1111-000000000005';

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

const test = () => rest(lucy, 'small_business_test?select=*').then((r) => r.json()).then((r) => r[0]);
const settings = (patch) => rest(lucy, `organisation_settings?organisation_id=eq.${ORG}`, {
  method: 'PATCH', body: JSON.stringify(patch),
});

/*
 * This check needs a casual, and it cannot rely on the seeded one: the casual
 * conversion check runs earlier and converts him to permanent, which is exactly
 * what it is supposed to do. Depending on another check's leftovers is how a
 * suite becomes order-sensitive and starts failing for reasons nobody can find.
 *
 * So it makes its own, and puts it back at the end.
 */
const pattyBefore = await rest(lucy, `profiles?select=employment_hours,employment_basis&id=eq.${PATTY}`)
  .then((r) => r.json()).then((rows) => rows?.[0]);
await rest(lucy, `profiles?id=eq.${PATTY}`, {
  method: 'PATCH', body: JSON.stringify({ employment_hours: 'Casual', employment_basis: 'Casual' }),
});

const restore = () => rest(lucy, `profiles?id=eq.${PATTY}`, {
  method: 'PATCH', body: JSON.stringify(pattyBefore),
});

// -------------------------------------------------------------- contractors
const marcie = await rest(lucy, `profiles?select=employment_basis,employment_hours&id=eq.${MARCIE}`)
  .then((r) => r.json()).then((rows) => rows?.[0]);
check(marcie?.employment_basis === 'Contract',
  'somebody can be engaged on a contract', JSON.stringify(marcie));

const owed = await rest(lucy, `statement_obligations?select=kind&employee_id=eq.${MARCIE}`)
  .then((r) => r.json());
check(Array.isArray(owed) && owed.length === 0,
  'and is owed neither information statement, because a contractor is not an employee',
  JSON.stringify(owed).slice(0, 120));

const eligible = await rest(lucy, 'rpc/casual_conversion_eligibility', {
  method: 'POST', body: JSON.stringify({ employee: MARCIE }),
}).then((r) => r.json()).then((rows) => rows?.[0]);
check(eligible?.eligible === false,
  'nor can a contractor use the pathway meant for casuals', JSON.stringify(eligible));

// A contractor still cannot be casual on one count and contract on the other.
const contradiction = await rest(lucy, `profiles?id=eq.${MARCIE}`, {
  method: 'PATCH', body: JSON.stringify({ employment_hours: 'Casual' }),
});
check(contradiction.status >= 400, 'and the two halves still have to agree',
  `status ${contradiction.status}`);

// ------------------------------------------------------------- the counting
let t = await test();
const employeesHere = t.employees_here;
check(t.contractors_here >= 1 && t.casuals_here >= 1,
  'the workspace knows how many contractors and casuals it has',
  `${t.contractors_here} contractors, ${t.casuals_here} casuals`);
check(t.counted === employeesHere,
  'neither is counted towards the threshold until somebody says so',
  `${t.counted} counted from ${employeesHere} employees`);
check(t.is_small_business === true, 'a workspace of five is a small business employer');

// A casual with a regular and systematic pattern does count.
await settings({ regular_casuals: 1 });
t = await test();
check(t.counted === employeesHere + 1,
  'a casual on a regular and systematic pattern is counted once declared', `${t.counted}`);

// So do the employees of associated entities.
await settings({ associated_headcount: 20 });
t = await test();
check(t.counted === employeesHere + 21, 'so are the employees of associated entities', `${t.counted}`);
check(t.is_small_business === false, 'and the threshold flips when the count passes fifteen');

// ------------------------------------------- and the flip changes obligations
//
// This is the point of the whole exercise. A non-small employer owes the casual
// statement at six months as well, and a casual may ask to go permanent after
// six rather than twelve.
const six = await rest(lucy, `statement_obligations?select=due_on&employee_id=eq.${PATTY}&kind=eq.Casual%20Employment%20Information%20Statement`)
  .then((r) => r.json());
check(six.length >= 3,
  'a non-small employer owes the casual statement at six months as well', `${six.length} due dates`);

await settings({ associated_headcount: 0, regular_casuals: 0 });
const back = await rest(lucy, `statement_obligations?select=due_on&employee_id=eq.${PATTY}&kind=eq.Casual%20Employment%20Information%20Statement`)
  .then((r) => r.json());
check(back.length < six.length, 'and stops owing it when the count falls back',
  `${six.length} -> ${back.length}`);

// ------------------------------------------------------- the employer's answer
await settings({ declared_small: false, declared_note: 'We have three associated entities.' });
t = await test();
check(t.is_small_business === false,
  'an employer who answers the question directly is taken at their word',
  `counted ${t.counted}, declared ${t.declared_small}`);
check(t.counted < 15, 'even where the count alone would say otherwise', `${t.counted}`);

await settings({ declared_small: null });
t = await test();
check(t.is_small_business === true, 'and clearing the answer goes back to the count');

// -------------------------------------------------------------- who may answer
const asEmployee = await rest(charlie, `organisation_settings?organisation_id=eq.${ORG}`, {
  method: 'PATCH', body: JSON.stringify({ associated_headcount: 500 }),
});
const unchanged = await test();
check(unchanged.associated_headcount === 0,
  'an employee cannot change what the workspace owes everybody',
  `status ${asEmployee.status}, now ${unchanged.associated_headcount}`);

const readable = await rest(charlie, 'small_business_test?select=is_small_business')
  .then((r) => r.json());
check(Array.isArray(readable) && readable.length === 1,
  'but can see the answer, because it decides what they are owed');

// Reviewing is stamped rather than taken on trust.
check(Boolean(unchanged.reviewed_at) && unchanged.reviewed_by_name === 'Lucy van Pelt',
  'and every answer records who gave it and when',
  `${unchanged.reviewed_by_name} at ${unchanged.reviewed_at}`);

// Put the workspace back the way it was found, so whatever runs next sees the
// seed rather than this check's scaffolding.
await restore();

process.exit(bad === 0 ? 0 : 1);
