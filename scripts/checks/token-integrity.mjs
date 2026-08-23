// A cookie is not proof of anything: the token still has to survive PostgREST.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const s = await (await fetch("http://127.0.0.1:54321/auth/v1/token?grant_type=password", {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "charlie@peanutsstudio.test", password: "snoopy123" }),
})).json();

// Swap Charlie's user id for Lucy's (an admin) inside the signed token's payload.
const [head, payload, sig] = s.access_token.split(".");
const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
claims.sub = "11111111-1111-1111-1111-000000000001";
const forged = [head, Buffer.from(JSON.stringify(claims)).toString("base64url"), sig].join(".");

const cases = [
  ["valid employee token", s.access_token],
  ["forged admin id", forged],
  ["garbage token", "not.a.token"],
];

for (const [label, token] of cases) {
  const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify({ ...s, access_token: token })).toString("base64")}`;
  const res = await fetch("http://localhost:3100/employees", { headers: { cookie }, redirect: "manual" });
  const body = res.status === 200 ? await res.text() : "";
  const reachedAdminPage = body.includes("Add employee");
  console.log(`${reachedAdminPage ? "FAIL" : "ok  "} ${label.padEnd(22)} status ${res.status}  admin page rendered: ${reachedAdminPage}`);
  if (reachedAdminPage) process.exitCode = 1;
}
