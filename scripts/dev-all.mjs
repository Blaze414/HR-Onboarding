#!/usr/bin/env node
/**
 * Runs the desktop and mobile dev servers side by side in one terminal.
 *
 * Each child gets its own process group so Ctrl-C (or one server dying) tears
 * down the whole tree — npm -> node -> next/expo — instead of orphaning it.
 * Port selection still belongs to scripts/dev-port.mjs, so a busy 3100 or 8081
 * moves along as usual.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SERVERS = [
  { label: 'desktop', colour: '[38;5;68m', args: ['run', 'desktop'] },
  { label: 'mobile', colour: '[38;5;173m', args: ['run', 'mobile'] },
];

const DIM = '[2m';
const RESET = '[0m';
const width = Math.max(...SERVERS.map((server) => server.label.length));

function prefix(server, chunk) {
  const tag = `${server.colour}${server.label.padEnd(width)}${DIM} │${RESET} `;
  const lines = String(chunk).split('\n');
  // A chunk almost always ends in a newline; drop the empty tail it leaves.
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.map((line) => tag + line).join('\n');
}

const root = fileURLToPath(new URL('..', import.meta.url));
const children = [];
let stopping = false;

function stopAll(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    // Negative pid signals the whole group, not just the npm wrapper.
    try {
      process.kill(-child.pid, signal);
    } catch {
      /* already gone */
    }
  }
}

for (const server of SERVERS) {
  const child = spawn('npm', server.args, {
    cwd: root,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  children.push(child);

  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => console.log(prefix(server, chunk)));
  }

  child.on('exit', (code) => {
    if (stopping) return;
    console.log(prefix(server, `exited with code ${code ?? 0} — stopping the other server`));
    process.exitCode = code ?? 0;
    stopAll();
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stopAll(signal));
}
