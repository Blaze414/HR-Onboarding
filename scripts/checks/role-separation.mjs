// The tier is not the whole story. Two accounts on the admin tier — a full
// Administrator and a narrower Learning Coordinator — must reach different
// routes, or the permission list is decoration.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const BASE = process.env.DESKTOP_URL ?? "http://localhost:3100";

async function login(email) {
  const r = await fetch("http://127.0.0.1:54321/auth/v1/token?grant_type=password", {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "snoopy123" }),
  });
  const session = await r.json();
  if (!session.access_token) throw new Error(`login failed for ${email}: ${JSON.stringify(session)}`);
  return `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;
}

async function reaches(cookie, route) {
  const res = await fetch(`${BASE}/${route}`, { headers: { cookie }, redirect: "manual" });
  if (res.status !== 200) return false;
  // A server-side redirect can still answer 200 with only the redirect payload.
  return !(await res.text()).includes("denied=1");
}

// route -> who should reach it
const MATRIX = {
  "dashboard":            { super: true,  admin: true,  coordinator: true },
  "courses":              { super: true,  admin: true,  coordinator: true },
  "onboarding":           { super: true,  admin: true,  coordinator: true },
  "analytics":            { super: true,  admin: true,  coordinator: true },
  "reports":              { super: true,  admin: true,  coordinator: true },
  "departments":          { super: true,  admin: true,  coordinator: true },
  "employees":            { super: true,  admin: true,  coordinator: true },
  // The line that separates a coordinator from an administrator:
  "employees/new":        { super: true,  admin: true,  coordinator: false },
  "settings/roles":       { super: true,  admin: true,  coordinator: false },
};

const users = {
  super:       await login("lucy@peanutsstudio.test"),
  coordinator: await login("marcie@peanutsstudio.test"),
  admin:       await login("sally@woodstockdigital.test"),
};

let bad = 0;
for (const [route, expected] of Object.entries(MATRIX)) {
  for (const [who, shouldReach] of Object.entries(expected)) {
    const got = await reaches(users[who], route);
    const ok = got === shouldReach;
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "FAIL"} ${who.padEnd(11)} ${shouldReach ? "reaches " : "blocked from"} /${route}${ok ? "" : ` (got ${got ? "reached" : "blocked"})`}`);
  }
}

// The sidebar must state which role you hold, not just "Administrator".
for (const [who, expectLabel] of [["super", "Super Administrator"], ["coordinator", "Learning Coordinator"]]) {
  const html = await fetch(`${BASE}/dashboard`, { headers: { cookie: users[who] } }).then((r) => r.text());
  const ok = html.includes(expectLabel);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} sidebar names "${expectLabel}" for ${who}`);
}

// Only a Super Administrator is offered a way to edit the role it holds.
const superHtml = await fetch(`${BASE}/settings/roles`, { headers: { cookie: users.super } }).then((r) => r.text());
const adminHtml = await fetch(`${BASE}/settings/roles`, { headers: { cookie: users.admin } }).then((r) => r.text());
const adminLocked = adminHtml.includes("only a Super Administrator can change it");
const superUnlocked = !superHtml.includes("only a Super Administrator can change it");
if (!adminLocked) bad++;
if (!superUnlocked) bad++;
console.log(`${adminLocked ? "ok  " : "FAIL"} administrator sees its own role as read-only`);
console.log(`${superUnlocked ? "ok  " : "FAIL"} super administrator may edit its own role`);

process.exit(bad ? 1 : 0);
