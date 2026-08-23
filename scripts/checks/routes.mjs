// Signs in over the auth API, then requests every workspace route with the
// resulting Supabase cookies so we exercise the real server-rendered pages.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const email = process.argv[2];
const routes = process.argv.slice(3);

const res = await fetch("http://127.0.0.1:54321/auth/v1/token?grant_type=password", {
  method: "POST",
  headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "snoopy123" }),
});
const session = await res.json();
if (!session.access_token) { console.error("login failed", session); process.exit(1); }

const ref = new URL("http://127.0.0.1:54321").host.split(":")[0];
const payload = encodeURIComponent(JSON.stringify(session));
const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;

let bad = 0;
for (const route of routes) {
  const r = await fetch(`http://localhost:3100/${route}`, { headers: { cookie }, redirect: "manual" });
  const body = r.status === 200 ? await r.text() : "";
  const broken = body.includes("That didn&#x27;t load") || body.includes("That didn't load");
  if (r.status !== 200 || broken) { bad++; console.log(`FAIL ${r.status}${broken ? " (error boundary)" : ""}  /${route}`); }
  else console.log(`ok   /${route}`);
}
process.exit(bad ? 1 : 0);
