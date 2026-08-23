/**
 * Proves progress is derived, not stored: change a record as the employee who
 * owns it, then read the employee, department and organisation figures back
 * as the admin and confirm every level moved.
 */
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const API = "http://127.0.0.1:54321";
const CHARLIE = "11111111-1111-1111-1111-000000000002";
const TECHNOLOGY = "a0000000-0000-0000-0000-00000000d001";

const login = async (email) => (await (await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "snoopy123" }),
})).json()).access_token;

const charlie = await login("charlie@peanutsstudio.test");
const lucy = await login("lucy@peanutsstudio.test");
const h = (t) => ({ apikey: ANON, Authorization: `Bearer ${t}`, "Content-Type": "application/json" });
const get = async (t, path) => (await (await fetch(`${API}/rest/v1/${path}`, { headers: h(t) })).json());

async function snapshot(label) {
  const [emp] = await get(lucy, `employee_progress?employee_id=eq.${CHARLIE}&select=*`);
  const [dept] = await get(lucy, `department_progress?department_id=eq.${TECHNOLOGY}&select=*`);
  const [org] = await get(lucy, `organisation_progress?select=*`);
  // The employee's own read of their figures must agree with the admin's.
  const [self] = await get(charlie, `employee_progress?employee_id=eq.${CHARLIE}&select=*`);
  console.log(
    `${label.padEnd(22)} employee ${String(emp.overall_progress).padStart(3)}%  ` +
    `courses ${String(emp.course_progress).padStart(3)}%  tasks ${String(emp.task_progress).padStart(3)}%  ` +
    `onboarding ${String(emp.onboarding_progress ?? 0).padStart(3)}%  |  dept ${String(dept.overall_progress).padStart(3)}%  org ${String(org.overall_progress).padStart(3)}%`,
  );
  if (self.overall_progress !== emp.overall_progress) {
    console.log("  MISMATCH: employee and admin see different overall progress");
    process.exitCode = 1;
  }
  return { emp, dept, org };
}

const before = await snapshot("before");

/*
 * This check has to change real records to prove the figures move, so it puts
 * them back afterwards. Without that it completes a seeded course and quietly
 * removes the overdue case other checks depend on — every later failure then
 * describes this check's leftovers rather than the product.
 */
const restore = [];
const missing = (what) => {
  console.log(`FAIL a ${what} was available to test with`);
  process.exitCode = 1;
};

// 1. Employee finishes a course assignment.
const [assignment] = await get(charlie, `course_assignments?user_id=eq.${CHARLIE}&status=neq.Completed&select=*&limit=1`);
if (!assignment) missing('course assignment');
restore.push([`course_assignments?id=eq.${assignment.id}`, {
  progress: assignment.progress, status: assignment.status, completed_at: assignment.completed_at,
}]);
await fetch(`${API}/rest/v1/course_assignments?id=eq.${assignment.id}`, {
  method: "PATCH", headers: h(charlie),
  body: JSON.stringify({ progress: 100, status: "Completed", completed_at: new Date().toISOString() }),
});
const afterCourse = await snapshot("after course done");

// 2. Employee completes an outstanding task.
const [task] = await get(charlie, `tasks?assigned_to=eq.${CHARLIE}&status=neq.Completed&select=*&limit=1`);
if (!task) missing('task');
if (task) restore.push([`tasks?id=eq.${task.id}`, { status: task.status, completed_at: task.completed_at }]);
await fetch(`${API}/rest/v1/tasks?id=eq.${task.id}`, {
  method: "PATCH", headers: h(charlie),
  body: JSON.stringify({ status: "Completed", completed_at: new Date().toISOString() }),
});
const afterTask = await snapshot("after task done");

// 3. Employee completes an onboarding step (progress is recalculated by trigger).
const [plan] = await get(charlie, `employee_onboarding?employee_id=eq.${CHARLIE}&select=id`);
const [step] = await get(charlie, `onboarding_steps?onboarding_id=eq.${plan.id}&status=neq.Completed&select=*&limit=1`);
if (!step) missing('onboarding step');
if (step) restore.push([`onboarding_steps?id=eq.${step.id}`, {
  status: step.status, completed_at: step.completed_at, completed_by: step.completed_by,
}]);
await fetch(`${API}/rest/v1/onboarding_steps?id=eq.${step.id}`, {
  method: "PATCH", headers: h(charlie),
  body: JSON.stringify({ status: "Completed", completed_at: new Date().toISOString(), completed_by: CHARLIE }),
});
const afterStep = await snapshot("after onboarding step");

const checks = [
  ["course completion raises course progress", afterCourse.emp.course_progress > before.emp.course_progress],
  ["task completion raises task progress", afterTask.emp.task_progress > afterCourse.emp.task_progress],
  ["onboarding step raises onboarding progress", afterStep.emp.onboarding_progress > afterTask.emp.onboarding_progress],
  ["employee overall rises overall", afterStep.emp.overall_progress > before.emp.overall_progress],
  ["department figure follows the employee", afterStep.dept.overall_progress > before.dept.overall_progress],
  ["organisation figure follows the department", afterStep.org.overall_progress > before.org.overall_progress],
];
console.log();
for (const [name, ok] of checks) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) process.exitCode = 1;
}

// Put the fixtures back exactly as they were found. Restored as the admin, since
// the column guard stops a learner rewriting an assignment's own fields.
for (const [path, body] of restore.reverse()) {
  await fetch(`${API}/rest/v1/${path}`, { method: "PATCH", headers: h(lucy), body: JSON.stringify(body) });
}
console.log("ok   fixtures restored for the checks that follow");
