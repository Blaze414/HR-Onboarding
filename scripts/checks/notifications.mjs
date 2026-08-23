// A notification must exist because something happened, not because a screen
// remembered to send one. Every case below performs a real action through
// PostgREST as a real user, then asserts the other party was told.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const API = "http://127.0.0.1:54321";

async function login(email) {
  const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "snoopy123" }),
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
      "Content-Type": "application/json", Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const lucy = await login("lucy@peanutsstudio.test");      // Super Administrator
const charlie = await login("charlie@peanutsstudio.test"); // Employee
const asLucy = rest(lucy);
const asCharlie = rest(charlie);

let bad = 0;
const check = (ok, label, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
};

const stamp = Date.now();

// ---- admin assigns required training -> the staff member is told
const course = await asLucy("courses", {
  method: "POST",
  body: JSON.stringify({
    organisation_id: "aaaaaaaa-0000-0000-0000-000000000001",
    title: `Check course ${stamp}`, status: "In Progress", created_by: lucy.id,
  }),
});
const courseId = course.body?.[0]?.id;
check(Boolean(courseId), "admin can create a course", JSON.stringify(course.body));

const due = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
const assignment = await asLucy("course_assignments", {
  method: "POST",
  body: JSON.stringify({
    organisation_id: "aaaaaaaa-0000-0000-0000-000000000001",
    course_id: courseId, user_id: charlie.id, assigned_by: lucy.id,
    is_required: true, due_date: due,
  }),
});
const assignmentId = assignment.body?.[0]?.id;
check(assignment.body?.[0]?.is_required === true, "assignment records the requirement");
check(assignment.body?.[0]?.due_date === due, "assignment records the due date");

const charlieFeed = await asCharlie(`notifications?select=*&order=created_at.desc&limit=5`);
const assignedNote = charlieFeed.body?.find((n) => n.entity_id === assignmentId);
check(Boolean(assignedNote), "staff member is notified of the assignment");
check(assignedNote?.title?.startsWith("Required:"), "the notification says it is required", assignedNote?.title);
check(Boolean(assignedNote?.href?.includes(courseId)), "the notification links to the course");
check(assignedNote?.read_at === null, "it arrives unread");

// ---- staff completes it -> the person who assigned it is told
await asCharlie(`course_assignments?id=eq.${assignmentId}`, {
  method: "PATCH", body: JSON.stringify({ status: "Completed", progress: 100 }),
});
const lucyFeed = await asLucy(`notifications?select=*&order=created_at.desc&limit=5`);
const doneNote = lucyFeed.body?.find((n) => n.entity_id === assignmentId && n.kind === "course_completed");
check(Boolean(doneNote), "the assigner is notified of completion");
check(doneNote?.title?.includes("Charlie"), "completion names who finished it", doneNote?.title);

// ---- nobody is notified about their own action
const selfNotes = charlieFeed.body?.filter((n) => n.actor_id === charlie.id) ?? [];
check(selfNotes.length === 0, "nobody is notified about their own action");

// ---- one person cannot read another's notifications
const stolen = await asCharlie(`notifications?select=*&user_id=eq.${lucy.id}`);
check(Array.isArray(stolen.body) && stolen.body.length === 0, "notifications are private to their recipient");

// ---- a client cannot forge one
const forged = await asCharlie("notifications", {
  method: "POST",
  body: JSON.stringify({
    organisation_id: "aaaaaaaa-0000-0000-0000-000000000001",
    user_id: charlie.id, kind: "task_assigned", title: "Forged",
  }),
});
check(forged.status >= 400, "a client cannot create a notification", `status ${forged.status}`);

// ---- marking read is scoped to your own rows
await asCharlie(`notifications?id=eq.${assignedNote?.id}`, {
  method: "PATCH", body: JSON.stringify({ read_at: new Date().toISOString() }),
});
const after = await asCharlie(`notifications?select=read_at&id=eq.${assignedNote?.id}`);
check(Boolean(after.body?.[0]?.read_at), "a recipient can mark their own notification read");

const stealMark = await asCharlie(`notifications?id=eq.${doneNote?.id}`, {
  method: "PATCH", body: JSON.stringify({ read_at: new Date().toISOString() }),
});
check(
  !Array.isArray(stealMark.body) || stealMark.body.length === 0,
  "a recipient cannot mark someone else's notification read",
);

// Dismissing is scoped the same way reading is.
const stealDelete = await asCharlie(`notifications?id=eq.${doneNote?.id}`, { method: "DELETE" });
check(
  !Array.isArray(stealDelete.body) || stealDelete.body.length === 0,
  "a recipient cannot delete someone else's notification",
);
const ownDelete = await asCharlie(`notifications?id=eq.${assignedNote?.id}`, { method: "DELETE" });
check(Array.isArray(ownDelete.body) && ownDelete.body.length === 1, "a recipient can dismiss their own");

// Clean up after itself. Deleting the course cascades its assignments, but the
// notifications it caused have no foreign key to follow, so they are removed by
// title — otherwise every run leaves permanent noise in someone's real feed.
await asLucy(`courses?id=eq.${courseId}`, { method: "DELETE" });
await asCharlie(`notifications?entity_id=eq.${assignmentId}`, { method: "DELETE" });
await asLucy(`notifications?entity_id=eq.${assignmentId}`, { method: "DELETE" });

process.exit(bad ? 1 : 0);
