// Pay records, pay slips and superannuation.
//
// The app does not calculate pay and does not pretend to. What it holds is the
// part the law puts on the employer whoever did the arithmetic: the record
// exists (Fair Work Regulations 3.33–3.36), the pay slip goes out within one
// working day (reg 3.46), the superannuation reaches the fund, and none of it
// can be quietly rewritten afterwards.
//
// Pay is also the most sensitive thing in the workspace, so who can see it is
// tested harder than anything else here.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const API = 'http://127.0.0.1:54321';
const ORG = 'aaaaaaaa-0000-0000-0000-000000000001';
const CHARLIE = '11111111-1111-1111-1111-000000000002';
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

const lucy = await login('lucy@peanutsstudio.test');       // payroll.manage
const charlie = await login('charlie@peanutsstudio.test'); // employee
const schroeder = await login('schroeder@peanutsstudio.test');
const sally = await login('sally@woodstockdigital.test');  // other workspace

// ------------------------------------------------------------- a pay period
const [period] = await rest(lucy, 'pay_periods', {
  method: 'POST',
  body: JSON.stringify({ organisation_id: ORG, starts_on: '2026-08-01', ends_on: '2026-08-14' }),
}).then((r) => r.json());
check(Boolean(period?.id) && period.status === 'Draft',
  'a pay period opens as a draft', JSON.stringify(period).slice(0, 120));

const closeEmpty = await rest(lucy, `pay_periods?id=eq.${period.id}`, {
  method: 'PATCH', body: JSON.stringify({ status: 'Paid' }),
});
check(closeEmpty.status >= 400, 'an empty period cannot be recorded as paid',
  `status ${closeEmpty.status}`);

// --------------------------------------------------------------- the figures
const transposed = await rest(lucy, 'pay_records', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, period_id: period.id, employee_id: CHARLIE,
    gross_cents: 200000, tax_withheld_cents: 40000, net_cents: 300000,
  }),
});
check(transposed.status >= 400, 'net pay above gross is refused — the common transposition',
  `status ${transposed.status}`);

const [line] = await rest(lucy, 'pay_records', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, period_id: period.id, employee_id: CHARLIE,
    gross_cents: 400000, tax_withheld_cents: 90000, net_cents: 310000,
    super_cents: 48000, super_fund: 'AustralianSuper',
    ordinary_hours: 76, overtime_hours: 4,
  }),
}).then((r) => r.json());
check(Boolean(line?.id), 'a pay line is recorded', JSON.stringify(line).slice(0, 120));
check(line?.source === 'Entered by hand',
  'and says where the figure came from', line?.source);

// A second person in the same period, so the slip assertions later have
// something to be isolated from.
const [pattyLine] = await rest(lucy, 'pay_records', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, period_id: period.id, employee_id: PATTY,
    gross_cents: 200000, tax_withheld_cents: 40000, net_cents: 160000, super_cents: 24000,
  }),
}).then((r) => r.json());
check(Boolean(pattyLine?.id), 'a second person can be added to the same period');

// Amendable while the period is a draft.
const amend = await rest(lucy, `pay_records?id=eq.${line.id}`, {
  method: 'PATCH', body: JSON.stringify({ gross_cents: 410000, net_cents: 320000 }),
});
const [amended] = await rest(lucy, `pay_records?select=gross_cents&id=eq.${line.id}`).then((r) => r.json());
check(amend.status < 400 && amended.gross_cents === 410000,
  'a draft can still be corrected', `${amended?.gross_cents}`);

// --------------------------------------------------------------- paying it
const paidOn = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
const close = await rest(lucy, `pay_periods?id=eq.${period.id}`, {
  method: 'PATCH', body: JSON.stringify({ status: 'Paid', paid_on: paidOn }),
});
check(close.status < 400, 'a period with lines in it can be recorded as paid', `status ${close.status}`);

const frozen = await rest(lucy, `pay_records?id=eq.${line.id}`, {
  method: 'PATCH', body: JSON.stringify({ gross_cents: 999999 }),
});
const [still] = await rest(lucy, `pay_records?select=gross_cents&id=eq.${line.id}`).then((r) => r.json());
check(still.gross_cents === 410000,
  'once paid, the figures are the record and cannot be edited',
  `status ${frozen.status}, now ${still.gross_cents}`);

const reopen = await rest(lucy, `pay_periods?id=eq.${period.id}`, {
  method: 'PATCH', body: JSON.stringify({ status: 'Draft' }),
});
check(reopen.status >= 400, 'and a paid period cannot be reopened', `status ${reopen.status}`);

const lateLine = await rest(lucy, 'pay_records', {
  method: 'POST',
  body: JSON.stringify({
    organisation_id: ORG, period_id: period.id, employee_id: PATTY,
    gross_cents: 100000, net_cents: 80000,
  }),
});
check(lateLine.status >= 400, 'nor take new lines afterwards', `status ${lateLine.status}`);

const erase = await rest(lucy, `pay_records?id=eq.${line.id}`, { method: 'DELETE' });
check(erase.status >= 400, 'and a pay record cannot be deleted at all', `status ${erase.status}`);

// -------------------------------------------------------- slips and super
const [owed] = await rest(lucy, `pay_obligations?select=*&id=eq.${line.id}`).then((r) => r.json());
check(owed?.slip_due_by !== null, 'a pay slip falls due once the money moves', owed?.slip_due_by);
check(owed?.slip_overdue === true, 'and reads as overdue when the working day has passed',
  `paid ${paidOn}, due ${owed?.slip_due_by}`);
check(owed?.super_overdue === false,
  'superannuation has longer, so it is not overdue yet',
  `due ${owed?.super_due_by}`);

await rest(lucy, `pay_records?id=eq.${line.id}`, {
  method: 'PATCH', body: JSON.stringify({ slip_issued_at: new Date().toISOString() }),
});
const [issued] = await rest(lucy, `pay_obligations?select=*&id=eq.${line.id}`).then((r) => r.json());
check(issued?.slip_overdue === false && Boolean(issued?.slip_issued_at),
  'issuing the slip settles it, late or not — the date it went out stays on the record',
  issued?.slip_issued_at);

/*
 * One slip is one slip. On a page showing a column of them, issuing the last
 * outstanding one is visually indistinguishable from issuing every one — so
 * the isolation is worth asserting rather than assuming.
 */
const stillOwed = await rest(lucy, `pay_records?select=employee_id,slip_issued_at&period_id=eq.${period.id}`)
  .then((r) => r.json());
check(
  stillOwed.find((r) => r.employee_id === PATTY)?.slip_issued_at === null
  && stillOwed.find((r) => r.employee_id === CHARLIE)?.slip_issued_at !== null,
  'issuing one slip issues one slip, and leaves the rest of the period owing',
  JSON.stringify(stillOwed.map((r) => [r.employee_id.slice(-4), Boolean(r.slip_issued_at)])));

await rest(lucy, `pay_records?id=eq.${line.id}`, {
  method: 'PATCH', body: JSON.stringify({ super_paid_on: new Date().toISOString().slice(0, 10) }),
});
const [superPaid] = await rest(lucy, `pay_obligations?select=super_paid_on&id=eq.${line.id}`)
  .then((r) => r.json());
check(Boolean(superPaid?.super_paid_on),
  'and the superannuation can be recorded as having reached the fund');

// ------------------------------------------------------------- who may see
/*
 * Scoped to the period this check created. The workspace is seeded with pay
 * runs of its own and other checks add more, so asserting on "every row the
 * employee can see" tests the fixtures rather than the rule.
 */
const own = await rest(charlie, `pay_obligations?select=employee_id&period_id=eq.${period.id}`)
  .then((r) => r.json());
check(Array.isArray(own) && own.length === 1 && own[0].employee_id === charlie.id,
  'an employee sees their own pay', JSON.stringify(own).slice(0, 120));

const colleague = await rest(schroeder, `pay_obligations?select=employee_id&period_id=eq.${period.id}`)
  .then((r) => r.json());
check(Array.isArray(colleague) && colleague.length === 0,
  'and a colleague sees none of it — including a manager, who gets no special view',
  JSON.stringify(colleague).slice(0, 120));

const charliePeriods = await rest(charlie, `pay_periods?select=id&id=eq.${period.id}`)
  .then((r) => r.json());
check(charliePeriods.length === 1,
  'an employee sees the period they were paid in, because their slip is in it',
  JSON.stringify(charliePeriods).slice(0, 120));

// Somebody with no line in this period cannot see it. Linus is in the other
// workspace, so he cannot see it for two reasons; Sally is the check for the
// workspace boundary elsewhere, and here it is the period membership that
// matters.
const outsider = await login('marcie@peanutsstudio.test');
const outsiderPeriods = await rest(outsider, `pay_periods?select=id&id=eq.${period.id}`)
  .then((r) => r.json());
check(Array.isArray(outsiderPeriods) && outsiderPeriods.length === 0,
  'and somebody who was not paid in it cannot see it at all',
  JSON.stringify(outsiderPeriods).slice(0, 120));

process.exit(bad === 0 ? 0 : 1);
