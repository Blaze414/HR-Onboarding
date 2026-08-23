// Employees must be bounced off admin routes by the server, not merely by a
// hidden nav link.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const r = await fetch("http://127.0.0.1:54321/auth/v1/token?grant_type=password", {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "charlie@peanutsstudio.test", password: "snoopy123" }),
});
const session = await r.json();
const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;

const allowed = ["dashboard", "courses", "tasks", "events", "documents", "onboarding", "profile", "settings"];
const denied = ["employees", "employees/new", "departments", "analytics", "reports", "activity",
                "courses/new", "tasks/new", "events/new", "onboarding/templates"];

let bad = 0;
for (const route of allowed) {
  const res = await fetch(`http://localhost:3100/${route}`, { headers: { cookie }, redirect: "manual" });
  const ok = res.status === 200;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} employee can open /${route} (${res.status})`);
}
for (const route of denied) {
  const res = await fetch(`http://localhost:3100/${route}`, { headers: { cookie }, redirect: "manual" });
  // Next may answer a server-side redirect either with a 307 or with a 200
  // whose payload only carries the redirect — both mean the page never rendered.
  const body = res.status === 200 ? await res.text() : "";
  const blocked = res.status === 307 || res.status === 302 || body.includes("denied=1");
  if (!blocked) bad++;
  console.log(`${blocked ? "ok  " : "FAIL"} employee blocked from /${route} (${res.status})`);
}
process.exit(bad ? 1 : 0);
