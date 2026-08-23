// Creates an event through the same authenticated API path the desktop form
// uses, then confirms the calendar picks it up without any manual refresh step.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const API = "http://127.0.0.1:54321";

const s = await (await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "lucy@peanutsstudio.test", password: "snoopy123" }),
})).json();
const auth = { apikey: ANON, Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json" };
const cookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64")}`;

// A day 4 weeks out that currently has nothing on it.
const target = new Date();
target.setDate(target.getDate() + 6);
const key = target.toISOString().slice(0, 10);

const before = await (await fetch("http://localhost:3100/events", { headers: { cookie } })).text();
const markedBefore = before.includes(`${target.toLocaleDateString(undefined, { day: "numeric", month: "long" })}, 1 event`);

const [created] = await (await fetch(`${API}/rest/v1/events`, {
  method: "POST", headers: { ...auth, Prefer: "return=representation" },
  body: JSON.stringify({
    organisation_id: "aaaaaaaa-0000-0000-0000-000000000001",
    title: "Calendar Smoke Test",
    start_time: `${key}T10:00:00Z`,
    location: "Studio — Room 1",
    created_by: "11111111-1111-1111-1111-000000000001",
  }),
})).json();

const after = await (await fetch("http://localhost:3100/events", { headers: { cookie } })).text();
const markedAfter = after.includes(`${target.toLocaleDateString(undefined, { day: "numeric", month: "long" })}, 1 event`);

console.log("target day:", key);
console.log("marked before create:", markedBefore);
console.log("marked after create :", markedAfter);
console.log("title reachable in day panel markup:", after.includes("Calendar Smoke Test"));

await fetch(`${API}/rest/v1/events?id=eq.${created.id}`, { method: "DELETE", headers: auth });
const cleaned = await (await fetch("http://localhost:3100/events", { headers: { cookie } })).text();
console.log("marked after delete :", cleaned.includes(`${target.toLocaleDateString(undefined, { day: "numeric", month: "long" })}, 1 event`));
