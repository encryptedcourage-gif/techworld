// Starts the marketplace server AND two separate Cloudflare "quick tunnels":
//   • a CLIENT link  (the customer-facing site) — share this
//   • an ADMIN link  (your control panel) — keep this private
//
//   npm run public
//
// Each link is its own random *.trycloudflare.com hostname. Because the admin
// panel lives on a different tunnel (a URL customers never receive) and its
// sign-in rejects customer accounts, the admin side stays separate and safer.
// Both tunnels auto-reconnect, so the links keep working when the laptop wakes
// from sleep. Member logins and messages live in the on-disk database, so they
// always survive a restart or sleep.

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function hasCloudflared() {
  return !spawnSync('cloudflared', ['--version'], { stdio: 'ignore' }).error;
}

function printInstallHelp() {
  console.error(`
  cloudflared is not installed. Install it, then run "npm run public" again:

    macOS:    brew install cloudflared
    Windows:  winget install --id Cloudflare.cloudflared
    Linux:    https://github.com/cloudflare/cloudflared/releases/latest

  The sites still run locally:
    CLIENT  http://localhost:${config.port}
    ADMIN   http://localhost:${config.adminPort}
`);
}

// 1) Start the app server (listens on both the client and admin ports).
const server = spawn(process.execPath, [join(__dirname, 'index.js')], {
  stdio: 'inherit',
  env: process.env,
});
server.on('exit', (code) => {
  console.error(`\n[tunnel] server exited (code ${code}). Shutting down.`);
  tunnels.forEach((t) => t.proc && t.proc.kill());
  process.exit(code ?? 0);
});

// 2) Two quick tunnels, each kept alive independently.
const tunnels = [
  { label: 'CLIENT LINK (share with customers)', port: config.port, url: null, proc: null },
  { label: 'ADMIN LINK  (keep private — your control panel)', port: config.adminPort, url: null, proc: null },
];

function banner() {
  const ready = tunnels.filter((t) => t.url);
  if (!ready.length) return;
  console.log('\n  ============================================================');
  for (const t of tunnels) {
    console.log(`    ${t.label}`);
    console.log(`      ${t.url || '(connecting…)'}\n`);
  }
  console.log('  ============================================================\n');
}

function start(t) {
  if (!hasCloudflared()) { printInstallHelp(); return; }
  t.proc = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${t.port}`], {
    env: process.env,
  });
  const scan = (buf) => {
    const m = buf.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (m && m[0] !== t.url) { t.url = m[0]; banner(); }
  };
  t.proc.stdout.on('data', scan);
  t.proc.stderr.on('data', scan);
  t.proc.on('exit', (code) => {
    console.error(`[tunnel] ${t.label} dropped (code ${code}). Reconnecting in 3s...`);
    t.url = null;
    t.proc = null;
    setTimeout(() => start(t), 3000);
  });
}

setTimeout(() => tunnels.forEach(start), 1500); // let the server bind first

function shutdown() {
  tunnels.forEach((t) => t.proc && t.proc.kill());
  if (server) server.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
