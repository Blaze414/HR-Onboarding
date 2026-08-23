// @supabase/ssr names the auth cookie after the backend URL's host. If the
// browser and the server resolve that host differently, the server cannot find
// the session it was just given and bounces back to the sign-in page forever.
// This asserts both sides agree, whichever host the app is reached on.
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const PORT = process.env.DESKTOP_PORT ?? "3100";
const LAN = process.env.LAN_IP;

let bad = 0;
const check = (ok, label, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
};

const r = await fetch("http://127.0.0.1:54321/auth/v1/token?grant_type=password", {
  method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "lucy@peanutsstudio.test", password: "snoopy123" }),
});
const session = await r.json();
if (!session.access_token) throw new Error("could not sign in to build a session");

// The cookie name a browser would write when the page is served from `host`.
const cookieFor = (host) =>
  `sb-${host.split(".")[0]}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64")}`;

async function reachesDashboard(host, cookie) {
  const res = await fetch(`http://${host}:${PORT}/dashboard`, {
    headers: { cookie, host: `${host}:${PORT}` },
    redirect: "manual",
  });
  if (res.status !== 200) return false;
  return !(await res.text()).includes("next=%2Fdashboard");
}

// Loopback: the long-standing case, and the one every other check relies on.
check(
  await reachesDashboard("127.0.0.1", cookieFor("127.0.0.1")),
  "a session from loopback is accepted on loopback",
);

if (LAN) {
  // The phone case: page served from the LAN address, so the browser writes
  // sb-<lan>-auth-token and the server must look for that same name.
  check(
    await reachesDashboard(LAN, cookieFor(LAN)),
    `a session from ${LAN} is accepted on ${LAN}`,
  );
  // The negative control: a cookie named for one host must NOT be accepted on
  // the other. Without this, the checks above would pass even if the server
  // ignored the name entirely.
  check(
    !(await reachesDashboard("127.0.0.1", cookieFor(LAN))),
    "a cookie named for the LAN host is refused on loopback",
  );
  // And the names must genuinely differ, or the test above proves nothing.
  check(
    cookieFor(LAN).split("=")[0] !== cookieFor("127.0.0.1").split("=")[0],
    "the two hosts really do use different cookie names",
    `${cookieFor(LAN).split("=")[0]} vs ${cookieFor("127.0.0.1").split("=")[0]}`,
  );
} else {
  console.log("     (set LAN_IP to also check the LAN host)");
}

process.exit(bad ? 1 : 0);
