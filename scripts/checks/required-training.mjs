// Required training must be visible to the person who has to do it, in the
// order that matches how urgent it is. Everything below reads the server-
// rendered HTML, so it asserts what a learner actually receives.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const BASE = process.env.DESKTOP_URL ?? "http://localhost:3100";

async function login(email) {
  const r = await fetch("http://127.0.0.1:54321/auth/v1/token?grant_type=password", {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "snoopy123" }),
  });
  const s = await r.json();
  if (!s.access_token) throw new Error(`login failed for ${email}`);
  return `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;
}
const get = (cookie, path) => fetch(`${BASE}${path}`, { headers: { cookie } }).then((r) => r.text());

let bad = 0;
const check = (ok, label, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
};

const charlie = await login("charlie@peanutsstudio.test");
const lucy = await login("lucy@peanutsstudio.test");

// ---- the learner's view
const courses = await get(charlie, "/courses");
check(courses.includes("req req-overdue"), "an overdue required course is marked overdue");
check(courses.includes("req req-due_soon"), "a course due within the week is marked due soon");
check(/Overdue since/.test(courses), "the overdue course states since when");
check(/required course(s)? need/.test(courses), "the page header counts what needs attention");

// Urgency decides the order, so the learner does not sort their own obligations.
const overdueAt = courses.indexOf("req req-overdue");
const dueSoonAt = courses.indexOf("req req-due_soon");
check(overdueAt > -1 && dueSoonAt > -1 && overdueAt < dueSoonAt, "overdue sorts above due soon");

// ---- the admin's view
const learners = await get(lucy, "/courses/c0000000-0000-0000-0000-00000000c001?tab=learners");
check(
  learners.includes("Assign learners"),
  "admin sees the assign control",
  learners.includes("denied=1") ? "redirected" : `len ${learners.length}`,
);

// ---- the bell
const dashboard = await get(charlie, "/dashboard");
check(dashboard.includes('aria-label="Notifications'), "the bell renders in the header");
check(dashboard.includes("notif-dot"), "unread work shows a count");

// An employee must never be offered the admin-only assign flow.
const employeeCourse = await get(charlie, "/courses/c0000000-0000-0000-0000-00000000c001?tab=learners");
check(!employeeCourse.includes("Assign learners"), "an employee is not offered the assign control");

process.exit(bad ? 1 : 0);
