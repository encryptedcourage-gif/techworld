// Starts the marketplace server AND a Cloudflare "quick tunnel" so anyone with
// the printed https://<random>.trycloudflare.com link can reach it — no
// Cloudflare account, no domain, no config needed.
//
//   npm run public
//
// The tunnel auto-reconnects, so when the laptop wakes from sleep the public
// link keeps working. (Quick-tunnel URLs are random and change if cloudflared
// fully restarts; the README explains how to pin a permanent URL if you want
// one.) Member logins and messages live in the on-disk database either way, so
// they always survive a restart or sleep.

import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = config.port;

function hasCloudflared() {
  const probe = spawnSync('cloudflared', ['--version'], { stdio: 'ignore' });
  return !probe.error;
}

function printInstallHelp() {
  console.error(`
  cloudflared is not installed. Install it, then run "npm run public" again:

    macOS:         brew install cloudflared
    Windows:       winget install --id Cloudflare.cloudflared
    Linux (deb):   https://pkg.cloudflare.com/  (or download the binary below)
    Any system:    https://github.com/cloudflare/cloudflared/releases/latest

  The server is still running locally at http://localhost:${PORT}
`);
}

// 1) Start the app server.
const server = spawn(process.execPath, [join(__dirname, 'index.js')], {
  stdio: 'inherit',
  env: process.env,
});
server.on('exit', (code) => {
  console.error(`\n[tunnel] server exited (code ${code}). Shutting down.`);
  if (tunnel) tunnel.kill();
  process.exit(code ?? 0);
});

// 2) Start (and keep alive) the Cloudflare quick tunnel.
let tunnel = null;
let lastUrl = null;

function startTunnel() {
  if (!hasCloudflared()) {
    printInstallHelp();
    return;
  }
  tunnel = spawn(
    'cloudflared',
    ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`],
    { env: process.env }
  );

  const scan = (buf) => {
    const text = buf.toString();
    const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (m && m[0] !== lastUrl) {
      lastUrl = m[0];
      console.log(`
  ============================================================
    PUBLIC LINK (share this):  ${lastUrl}
    Admin signs in there too.  Local: http://localhost:${PORT}
  ============================================================
`);
    }
  };
  tunnel.stdout.on('data', scan);
  tunnel.stderr.on('data', scan); // cloudflared prints the URL to stderr

  tunnel.on('exit', (code) => {
    console.error(`[tunnel] cloudflared exited (code ${code}). Reconnecting in 3s...`);
    lastUrl = null;
    tunnel = null;
    setTimeout(startTunnel, 3000); // auto-recover after sleep/network drop
  });
}

// Give the server a moment to bind the port, then open the tunnel.
setTimeout(startTunnel, 1500);

function shutdown() {
  if (tunnel) tunnel.kill();
  if (server) server.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
