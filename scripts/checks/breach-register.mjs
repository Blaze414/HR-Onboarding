// Suspected data breaches, and the clock the scheme runs on.
//
// The Notifiable Data Breaches scheme is a sequence with dates attached:
// suspicion starts a thirty-day assessment; an assessment that finds the breach
// eligible obliges notification of the Commissioner and of the people affected,
// as soon as practicable and with no second thirty days. What is tested here is
// that the record cannot be made to tell a better story than what happened —
// the clock cannot be moved, a finding cannot be recorded without reasoning,
// and a notification cannot be logged for a breach nobody assessed.
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

const lucy = await login('lucy@peanutsstudio.test');     // Super Administrator
const marcie = await login('marcie@peanutsstudio.test'); // ordinary admin
const charlie = await login('charlie@peanutsstudio.test');

// ------------------------------------------------------------- who may record
const asAdmin = await rest(marcie, 'data_breaches', {
  method: 'POST', body: JSON.stringify({ organisation_id: ORG, summary: 'Admin tried to record one' }),
});
check(asAdmin.status >= 400, 'an ordinary admin cannot record a breach', `status ${asAdmin.status}`);

const asEmployee = await rest(charlie, 'data_breaches?select=id').then((r) => r.json());
check(Array.isArray(asEmployee) && asEmployee.length === 0,
  'and nobody outside the role can read the register', JSON.stringify(asEmployee).slice(0, 100));

// ------------------------------------------------------------------ the clock
//
// Backdated by ten days: a breach is suspected before somebody opens the page,
// and the clock runs from the suspicion.
const suspected = new Date(Date.now() - 10 * 86400000).toISOString();
const [breach] = await rest(lucy, 'data_breaches', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, suspected_at: suspected,
    summary: 'Breach check — personal documents downloaded from an unfamiliar session.',
    information: 'Signed employment agreements.',
  }),
}).then((r) => r.json());

check(Boolean(breach?.id), 'a Super Administrator can record one', JSON.stringify(breach).slice(0, 120));

const days = Math.round(
  (new Date(`${breach.assess_by}T00:00:00Z`) - new Date(`${suspected.slice(0, 10)}T00:00:00Z`)) / 86400000,
);
check(days === 30, 'the assessment is owed within 30 days of the suspicion', `${days} days`);
check(breach.decision === 'Assessing', 'and it starts as being assessed', breach.decision);

const [view] = await rest(lucy, `breach_register?select=*&id=eq.${breach.id}`).then((r) => r.json());
check(view?.days_to_assess === 20, 'with the days already spent counted against it',
  `${view?.days_to_assess} left`);
check(view?.raised_by_name === 'Lucy van Pelt', 'and the person who raised it on the record',
  view?.raised_by_name);

const moveIt = await rest(lucy, `data_breaches?id=eq.${breach.id}`, {
  method: 'PATCH', body: JSON.stringify({ assess_by: '2027-01-01', suspected_at: new Date().toISOString() }),
});
const [after] = await rest(lucy, `breach_register?select=assess_by,suspected_at&id=eq.${breach.id}`)
  .then((r) => r.json());
check(after?.assess_by === breach.assess_by && after?.suspected_at === breach.suspected_at,
  'neither the suspicion date nor the deadline can be moved afterwards',
  `status ${moveIt.status}, ${breach.assess_by} -> ${after?.assess_by}`);

// -------------------------------------------------------- assessing it
const noReasoning = await rest(lucy, `data_breaches?id=eq.${breach.id}`, {
  method: 'PATCH', body: JSON.stringify({ decision: 'Not eligible' }),
});
check(noReasoning.status >= 400, 'a finding cannot be recorded without the reasoning behind it',
  `status ${noReasoning.status}`);

const early = await rest(lucy, `data_breaches?id=eq.${breach.id}`, {
  method: 'PATCH', body: JSON.stringify({ oaic_notified_at: new Date().toISOString() }),
});
check(early.status >= 400, 'and a notification cannot be logged before there is a finding',
  `status ${early.status}`);

const assess = await rest(lucy, `data_breaches?id=eq.${breach.id}`, {
  method: 'PATCH',
  body: JSON.stringify({
    decision: 'Eligible — notification required',
    assessment_note: 'Home addresses and dates of birth were in the files. Serious harm is likely.',
    people_affected: 3,
  }),
});
check(assess.status < 400, 'a reasoned finding is accepted', `status ${assess.status}`);

const [assessed] = await rest(lucy, `breach_register?select=*&id=eq.${breach.id}`).then((r) => r.json());
check(Boolean(assessed?.assessed_at), 'and is stamped with when it was made');
check(assessed?.assessed_by_name === 'Lucy van Pelt', 'and by whom', assessed?.assessed_by_name);
check(assessed?.notification_outstanding === true,
  'an eligible breach reads as owing a notification until both halves are done');

// ------------------------------------------------- both halves are separate
await rest(lucy, `data_breaches?id=eq.${breach.id}`, {
  method: 'PATCH', body: JSON.stringify({ oaic_notified_at: new Date().toISOString() }),
});
const [half] = await rest(lucy, `breach_register?select=*&id=eq.${breach.id}`).then((r) => r.json());
check(half?.notification_outstanding === true,
  'telling the Commissioner does not discharge telling the people');

await rest(lucy, `data_breaches?id=eq.${breach.id}`, {
  method: 'PATCH', body: JSON.stringify({ individuals_notified_at: new Date().toISOString() }),
});
const [done] = await rest(lucy, `breach_register?select=*&id=eq.${breach.id}`).then((r) => r.json());
check(done?.notification_outstanding === false, 'both halves together do');

// ------------------------------------------------------------ it stays there
const erase = await rest(lucy, `data_breaches?id=eq.${breach.id}`, { method: 'DELETE' });
check(erase.status >= 400, 'a breach cannot be removed from the register once recorded',
  `status ${erase.status}`);

const stillThere = await rest(lucy, `breach_register?select=id&id=eq.${breach.id}`).then((r) => r.json());
check(stillThere.length === 1, 'not even one that turned out to be nothing');

process.exit(bad === 0 ? 0 : 1);
