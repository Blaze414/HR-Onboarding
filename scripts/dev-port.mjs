#!/usr/bin/env node
/**
 * Runs a dev server on the first free port at or after the preferred one, so a
 * second workspace (or a leftover process) never blocks `npm run dev`.
 *
 *   node scripts/dev-port.mjs --port 3100 --var PORT -- next dev -p {port}
 *
 * {port} in the command is replaced with the chosen port, and --var exports it
 * as an environment variable for tools that read one instead of a flag.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';

const argv = process.argv.slice(2);
const dashdash = argv.indexOf('--');
if (dashdash === -1) {
  console.error('dev-port: expected a command after --');
  process.exit(1);
}

const flags = argv.slice(0, dashdash);
const command = argv.slice(dashdash + 1);
const readFlag = (name, fallback) => {
  const i = flags.indexOf(name);
  return i === -1 ? fallback : flags[i + 1];
};

const preferred = Number(readFlag('--port', '3000'));
const envVar = readFlag('--var', null);
const attempts = Number(readFlag('--attempts', '20'));

function isFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    // 0.0.0.0 so a server already bound to any interface counts as occupied.
    server.listen(port, '0.0.0.0');
  });
}

let port = preferred;
for (let i = 0; i < attempts; i += 1) {
  // eslint-disable-next-line no-await-in-loop
  if (await isFree(preferred + i)) { port = preferred + i; break; }
  if (i === attempts - 1) {
    console.error(`dev-port: no free port between ${preferred} and ${preferred + attempts - 1}`);
    process.exit(1);
  }
}

if (port !== preferred) {
  console.log(`\nPort ${preferred} is busy — starting on ${port} instead.\n`);
}

const [bin, ...rest] = command.map((part) => part.replaceAll('{port}', String(port)));
const child = spawn(bin, rest, {
  stdio: 'inherit',
  env: envVar ? { ...process.env, [envVar]: String(port) } : process.env,
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
