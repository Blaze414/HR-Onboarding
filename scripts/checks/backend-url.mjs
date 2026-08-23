// A device that is not the machine running the stack must still reach the
// backend. These are the cases that produce "Cannot reach the server" when the
// backend is actually healthy.
// The shared package ships as TypeScript source, so this check runs under
// Node's type stripping rather than importing a build that does not exist.
import { resolveBackendUrl } from '../../packages/shared/src/utils.ts';

const CASES = [
  // configured,                  device host,      expected
  ['http://127.0.0.1:54321', '192.168.1.43', 'http://192.168.1.43:54321', 'phone on the LAN gets the LAN host'],
  ['http://127.0.0.1:54321', 'localhost', 'http://127.0.0.1:54321', 'the host machine is left alone'],
  ['http://127.0.0.1:54321', '127.0.0.1', 'http://127.0.0.1:54321', 'loopback device is left alone'],
  ['http://localhost:54321', '192.168.1.43', 'http://192.168.1.43:54321', 'localhost is rewritten too'],
  ['http://127.0.0.1:54321', '192.168.1.43:8081', 'http://192.168.1.43:54321', 'a packager host with a port is stripped'],
  ['https://abc.supabase.co', '192.168.1.43', 'https://abc.supabase.co', 'a hosted backend is never rewritten'],
  ['https://abc.supabase.co', null, 'https://abc.supabase.co', 'no device host leaves it unchanged'],
  ['http://127.0.0.1:54321', null, 'http://127.0.0.1:54321', 'no device host cannot break the default'],
  ['', '192.168.1.43', '', 'an unset URL stays unset'],
  ['not a url', '192.168.1.43', 'not a url', 'a malformed URL is returned as-is'],
];

let bad = 0;
for (const [configured, host, expected, label] of CASES) {
  const got = resolveBackendUrl(configured, host);
  const ok = got === expected;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — got ${got}, wanted ${expected}`}`);
}
process.exit(bad ? 1 : 0);
