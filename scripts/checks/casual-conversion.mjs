// The employee choice pathway.
//
// A casual tells the employer in writing that they want permanent employment.
// Three of the rules around that are deadlines and constraints rather than
// intentions, and each of them is tested here by trying to break it:
//
//   * Who may give notice, and when. Six months of service, twelve in a small
//     business, and not again within six months of the last one.
//   * The employer must consult before answering, and answer within 21 days.
//   * A refusal is lawful only on one of three grounds, and has to say which.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const API = 'http://127.0.0.1:54321';
const ORG = 'aaaaaaaa-0000-0000-0000-000000000001';
const SCHROEDER = '11111111-1111-1111-1111-000000000003'; // casual, notice already given
const CHARLIE = '11111111-1111-1111-1111-000000000002';   // ongoing full-time

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
const rpc = (who, fn, args) => rest(who, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
const body = (r) => r.json().then((j) => JSON.stringify(j).slice(0, 160));

const lucy = await login('lucy@peanutsstudio.test');       // can answer
const charlie = await login('charlie@peanutsstudio.test'); // ongoing, cannot give notice
const schroeder = await login('schroeder@peanutsstudio.test');
const patty = await login('patty@peanutsstudio.test');     // colleague

// ---------------------------------------------------------------- who may ask
const forCharlie = await rpc(charlie, 'casual_conversion_eligibility', { employee: CHARLIE })
  .then((r) => r.json()).then((rows) => rows?.[0]);
check(forCharlie?.eligible === false && /casual/i.test(forCharlie?.reason ?? ''),
  'somebody who is not casual cannot give notice', JSON.stringify(forCharlie));

const tryAnyway = await rest(charlie, 'casual_conversion_notices', {
  method: 'POST', body: JSON.stringify({ organisation_id: ORG, employee_id: CHARLIE }),
});
check(tryAnyway.status >= 400, 'and the database refuses it, not just the screen',
  `status ${tryAnyway.status}`);

const forSomebodyElse = await rest(charlie, 'casual_conversion_notices', {
  method: 'POST', body: JSON.stringify({ organisation_id: ORG, employee_id: SCHROEDER }),
});
check(forSomebodyElse.status >= 400, 'nobody can give notice on another person\'s behalf',
  `status ${forSomebodyElse.status}`);

// Schroeder gave one 25 days ago in the seed, so he is inside the six-month wait.
const again = await rpc(schroeder, 'casual_conversion_eligibility', { employee: SCHROEDER })
  .then((r) => r.json()).then((rows) => rows?.[0]);
check(again?.eligible === false && /already given/i.test(again?.reason ?? ''),
  'a second notice inside six months is refused', JSON.stringify(again));

// --------------------------------------------------------------- the clock
const [notice] = await rest(lucy, 'casual_conversion_worklist?select=*&status=eq.Awaiting%20response')
  .then((r) => r.json());
check(Boolean(notice?.id), 'there is a notice awaiting an answer', JSON.stringify(notice).slice(0, 120));

/*
 * A deadline is a day, not an instant, so `due_by` is a date and the time the
 * notice happened to be given is dropped. Comparing it against the full
 * timestamp measures 20-point-something days and rounds however the clock
 * fell — which says nothing about whether the rule is right.
 */
const owed = Math.round(
  (new Date(`${notice.due_by}T00:00:00Z`) - new Date(`${notice.given_at.slice(0, 10)}T00:00:00Z`))
  / 86400000,
);
check(owed === 21, 'the answer is owed 21 days after the notice', `${owed} days`);
check(notice.is_overdue === true, 'and one past its date reads as overdue',
  `due ${notice.due_by}, ${notice.days_left} days left`);

const moveTheGoalposts = await rest(lucy, `casual_conversion_notices?id=eq.${notice.id}`, {
  method: 'PATCH', body: JSON.stringify({ due_by: '2027-01-01' }),
});
const after = await rest(lucy, `casual_conversion_worklist?select=due_by&id=eq.${notice.id}`)
  .then((r) => r.json()).then((rows) => rows?.[0]);
check(after?.due_by === notice.due_by, 'and the deadline cannot be pushed out afterwards',
  `${notice.due_by} -> ${after?.due_by} (status ${moveTheGoalposts.status})`);

// ------------------------------------------------------- consult, then answer
const answerFirst = await rest(lucy, `casual_conversion_notices?id=eq.${notice.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'Refused', refusal_ground: 'Fair and reasonable operational grounds' }),
});
check(answerFirst.status >= 400, 'answering before consulting is refused',
  await body(answerFirst.clone ? answerFirst.clone() : answerFirst));

const consult = await rest(lucy, `casual_conversion_notices?id=eq.${notice.id}`, {
  method: 'PATCH', body: JSON.stringify({ consulted_at: new Date().toISOString() }),
});
check(consult.status < 400, 'the consultation can be recorded on its own', `status ${consult.status}`);

const noGround = await rest(lucy, `casual_conversion_notices?id=eq.${notice.id}`, {
  method: 'PATCH', body: JSON.stringify({ status: 'Refused' }),
});
check(noGround.status >= 400, 'a refusal without one of the three grounds is refused',
  `status ${noGround.status}`);

const stillCasual = await rest(lucy, `casual_conversion_notices?id=eq.${notice.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'Accepted', new_hours: 'Casual', new_basis: 'Casual' }),
});
check(stillCasual.status >= 400, 'accepting has to stop the employment being casual',
  `status ${stillCasual.status}`);

const noParticulars = await rest(lucy, `casual_conversion_notices?id=eq.${notice.id}`, {
  method: 'PATCH', body: JSON.stringify({ status: 'Accepted' }),
});
check(noParticulars.status >= 400, 'and has to say what the employment becomes',
  `status ${noParticulars.status}`);

// ---------------------------------------------------------- who may answer
const selfAnswer = await rest(schroeder, `casual_conversion_notices?id=eq.${notice.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'Accepted', new_hours: 'Full-time', new_basis: 'Ongoing' }),
});
check(selfAnswer.status >= 400, 'an employee cannot answer their own notice',
  `status ${selfAnswer.status}`);

const nosy = await rest(patty, 'casual_conversion_notices?select=id').then((r) => r.json());
check(Array.isArray(nosy) && nosy.length === 0,
  'a colleague cannot see who has asked to go permanent', JSON.stringify(nosy).slice(0, 120));

const mine = await rest(schroeder, 'casual_conversion_notices?select=id').then((r) => r.json());
check(Array.isArray(mine) && mine.length === 1, 'but the employee sees their own',
  JSON.stringify(mine).slice(0, 120));

// ------------------------------------------------------- accepting it works
const accept = await rest(lucy, `casual_conversion_notices?id=eq.${notice.id}`, {
  method: 'PATCH',
  body: JSON.stringify({
    status: 'Accepted', new_hours: 'Part-time', new_basis: 'Ongoing',
    response_note: 'Permanent part-time from the next pay period.',
  }),
});
check(accept.status < 400, 'a properly consulted acceptance goes through', `status ${accept.status}`);

const record = await rest(lucy, `profiles?select=employment_hours,employment_basis&id=eq.${SCHROEDER}`)
  .then((r) => r.json()).then((rows) => rows?.[0]);
check(record?.employment_hours === 'Part-time' && record?.employment_basis === 'Ongoing',
  'and the employment record follows the answer, not a separate edit', JSON.stringify(record));

const twice = await rest(lucy, `casual_conversion_notices?id=eq.${notice.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'Refused', refusal_ground: 'Fair and reasonable operational grounds' }),
});
check(twice.status >= 400, 'and a notice cannot be answered a second time', `status ${twice.status}`);

// No longer casual, so no longer owed the casual statement.
const ceis = await rest(lucy, `statement_obligations?select=kind&employee_id=eq.${SCHROEDER}&kind=eq.Casual%20Employment%20Information%20Statement`)
  .then((r) => r.json());
check(Array.isArray(ceis) && ceis.length === 0,
  'and what the employer owes them changes with it', JSON.stringify(ceis).slice(0, 120));

process.exit(bad === 0 ? 0 : 1);
