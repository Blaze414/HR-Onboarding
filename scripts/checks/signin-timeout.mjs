// A sign in against an unreachable host must fail within a few seconds, not
// hang. Hanging is what produces a sign-in button that spins forever.
// Imported by file rather than through the package index: the shared sources use
// extensionless imports, which Node's ESM resolver does not follow.
import { createSupabaseClient } from '../../packages/shared/src/supabase.ts';
import { friendlyError } from '../../packages/shared/src/utils.ts';

import net from "node:net";

const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
let bad = 0;
const check = (ok, label, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
};

// A socket that accepts the connection and then says nothing. This is what an
// unreachable backend actually looks like to a phone: not a refusal, silence.
// A refused port would return instantly and never exercise the deadline.
const silent = net.createServer(() => {});
await new Promise((resolve) => silent.listen(0, "127.0.0.1", resolve));
const port = silent.address().port;

const dead = createSupabaseClient({
  url: `http://127.0.0.1:${port}`, anonKey: ANON, timeoutMs: 3000,
});

const started = Date.now();
let message = "";
try {
  const { error } = await dead.auth.signInWithPassword({
    email: "charlie@peanutsstudio.test", password: "snoopy123",
  });
  message = error ? friendlyError(error) : "(no error returned)";
} catch (thrown) {
  message = friendlyError(thrown);
}
const elapsed = Date.now() - started;

silent.close();
check(elapsed >= 2500 && elapsed < 8000, `it waits for the deadline then gives up (${elapsed}ms)`);
check(message !== "(no error returned)", "it reports a failure rather than succeeding");
check(
  /did not answer in time|Cannot reach the server/.test(message),
  "the failure is stated in plain language",
  message,
);
console.log(`     message: ${message}`);

// The healthy backend must still sign in normally.
const live = createSupabaseClient({ url: "http://127.0.0.1:54321", anonKey: ANON });
const { data, error } = await live.auth.signInWithPassword({
  email: "charlie@peanutsstudio.test", password: "snoopy123",
});
check(!error && Boolean(data.session), "a reachable backend still signs in", error?.message ?? "");

process.exit(bad ? 1 : 0);
