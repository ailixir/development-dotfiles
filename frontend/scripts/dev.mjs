#!/usr/bin/env node
/**
 * Starts the PUT Checks frontend (Vite standalone) against a local backend. Plain Node, no bash: Windows, macOS and
 * Linux. Depends only on this folder. Start order for the full local stack: studio-runner, backend, frontend.
 *
 *   node scripts/dev.mjs [--port N] [-h|--help]        (also: pnpm run dev:local)
 *
 * Vite runs in the foreground of this terminal, so Ctrl+C reaches it directly; this script waits for it (10 s) and
 * then ends it (POSIX: SIGKILL, Windows: taskkill /T /F). Its PID file is <PUT_CHECKS_LOCAL_DIR>/pids/frontend.json:
 * a leftover Vite of this checkout still holding the port is stopped, any other process on the port is reported.
 */
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const FRONTEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WINDOWS = process.platform === 'win32';

const log = (message) => console.log(`[frontend] ${message}`);
const warn = (message) => console.error(`[frontend] WARN: ${message}`);
const die = (message) => { console.error(`[frontend] ERROR: ${message}`); process.exit(1); };

const USAGE = `Usage: node scripts/dev.mjs [--port N] [-h]

Starts the Vite dev server (standalone mode) for the Checks frontend. It proxies /api/v1 to the
backend and adds the local dev session cookie.

Options:
  --port N    frontend port (default: $PUT_CHECKS_FRONTEND_PORT, else 5173)
  -h, --help  this help

Environment:
  PUT_CHECKS_FRONTEND_PORT  frontend port (default 5173). Set the same value for the backend
                            launcher: it adds http://localhost:<port> to the backend CORS list.
  PUT_CHECKS_BACKEND_PORT   backend port the proxy targets (default 8080)
  PUT_CHECKS_LOCAL_DIR      where the PID file is kept (default $HOME/.put-checks/local)`;

const isAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };

/** Connect probe first (binds nothing), then a bind test on every loopback and wildcard address. */
async function portBusy(port) {
  const answers = (host) => new Promise((done) => {
    const socket = connect({ host, port });
    const finish = (value) => { socket.destroy(); done(value); };
    socket.setTimeout(500, () => finish(false)); socket.once('connect', () => finish(true)); socket.once('error', () => finish(false));
  });
  if ((await Promise.all(['127.0.0.1', '::1'].map(answers))).some(Boolean)) return true;
  for (const host of ['0.0.0.0', '::', '127.0.0.1', '::1']) {
    const code = await new Promise((done) => {
      const server = createServer();
      server.once('error', (error) => done(error.code));
      server.listen({ port, host, exclusive: true }, () => server.close(() => done('free')));
    });
    if (code === 'EADDRINUSE' || code === 'EACCES') return true;
  }
  return false;
}

async function waitGone(pid, ms) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) if (!isAlive(pid)) return true;
  return !isAlive(pid);
}

function kill(pid) {
  if (!WINDOWS) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } return; }
  const exe = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe');
  try { execFileSync(existsSync(exe) ? exe : 'taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
}

/** pnpm is a .cmd on Windows, which needs the shell. */
function pnpm(args, options = {}) {
  const result = WINDOWS
    ? spawnSync(['pnpm', ...args].join(' '), { cwd: FRONTEND_DIR, stdio: 'inherit', ...options, shell: true })
    : spawnSync('pnpm', args, { cwd: FRONTEND_DIR, stdio: 'inherit', ...options });
  return result.status === 0;
}

async function main(argv) {
  let port = process.env.PUT_CHECKS_FRONTEND_PORT || '5173';
  const backendPort = process.env.PUT_CHECKS_BACKEND_PORT || '8080';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--port') { if (i + 1 >= argv.length) die('--port needs a value'); port = argv[(i += 1)]; }
    else if (arg.startsWith('--port=')) port = arg.slice('--port='.length);
    else if (arg === '-h' || arg === '--help') { console.log(USAGE); return 0; }
    else { console.error(USAGE); die(`unknown option: ${arg}`); }
  }
  if (!/^\d+$/.test(port)) die(`invalid frontend port: ${port}`);
  if (!/^\d+$/.test(backendPort)) die(`invalid backend port: ${backendPort}`);

  // ── Prerequisites
  if (!pnpm(['--version'], { stdio: 'ignore' })) die('pnpm not found. Install it (https://pnpm.io/installation); npm and yarn are not used here.');
  if (!existsSync(join(FRONTEND_DIR, 'node_modules'))) {
    log('node_modules missing; running pnpm install --frozen-lockfile');
    if (!pnpm(['install', '--frozen-lockfile'])) die('pnpm install failed');
  }
  // @put/core-components is a file: dependency (../../put-core-components) that pnpm copies into node_modules; the
  // copy is only usable once that package was built before the install.
  if (!existsSync(join(FRONTEND_DIR, 'node_modules', '@put', 'core-components', 'dist', 'index.js'))) {
    warn('@put/core-components is not built in node_modules.');
    warn('Run: (cd ../../put-core-components && npm run build) && pnpm install');
  }

  // ── Port: free it only if it is this checkout's Vite (from the PID file)
  const dir = resolve(process.env.PUT_CHECKS_LOCAL_DIR || join(process.env.HOME || homedir(), '.put-checks', 'local'));
  const pidFile = join(dir, 'pids', 'frontend.json');
  let previous = null;
  try { previous = JSON.parse(readFileSync(pidFile, 'utf8')); } catch { /* none */ }
  const sameCheckout = previous && (WINDOWS ? previous.checkout?.toLowerCase() === FRONTEND_DIR.toLowerCase() : previous.checkout === FRONTEND_DIR);
  if (previous && String(previous.port) === port && isAlive(previous.pid) && await portBusy(Number(port))) {
    if (!sameCheckout) die(`Port ${port} is in use by PID ${previous.pid}, a Vite started from ${previous.checkout}, not this checkout's frontend. Stop it or pick another port with --port.`);
    log(`Port ${port} is held by this checkout's Vite (PID ${previous.pid}); stopping it`);
    if (!WINDOWS) { try { process.kill(previous.pid, 'SIGTERM'); } catch { /* gone */ } }
    if (WINDOWS || !await waitGone(previous.pid, 10000)) kill(previous.pid);
    await waitGone(previous.pid, 5000);
  }
  if (await portBusy(Number(port))) die(`Port ${port} is in use by a process this launcher did not start. Stop it or pick another port with --port.`);

  // ── Backend reachability (informational only)
  try { await fetch(`http://localhost:${backendPort}/actuator/info`, { signal: AbortSignal.timeout(2000) }).then((r) => { if (!r.ok) throw new Error(); }); }
  catch { log(`Note: no backend answering on http://localhost:${backendPort}/actuator/info yet; /api/v1 calls fail until it is up (start the backend launcher).`); }
  if (port !== '5173') log(`Note: the backend CORS list must include http://localhost:${port}; the backend launcher adds it when started with the same PUT_CHECKS_FRONTEND_PORT=${port}.`);

  log(`Starting Vite on http://localhost:${port} (proxy /api/v1 -> http://localhost:${backendPort})`);
  // `pnpm exec vite` without pnpm in between: Vite is the direct child, so no shell or .cmd sits in the signal path.
  const vite = spawn(process.execPath, [join(FRONTEND_DIR, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', port, '--strictPort'], {
    cwd: FRONTEND_DIR, stdio: 'inherit',
    env: { ...process.env, VITE_API_URL: `http://localhost:${backendPort}`, VITE_DEV_SESSION_COOKIE: 'local-dev-session' },
  });
  mkdirSync(join(dir, 'pids'), { recursive: true, mode: 0o700 });
  writeFileSync(`${pidFile}.tmp`, JSON.stringify({ pid: vite.pid, port: Number(port), checkout: FRONTEND_DIR }), { mode: 0o600 });
  renameSync(`${pidFile}.tmp`, pidFile);

  const exited = new Promise((done) => vite.once('exit', (code, signal) => done(code ?? (signal ? 1 : 0))));
  // Ctrl+C reaches Vite directly (same terminal); give it 10 s, then end it.
  const stop = () => { void (async () => { if (!await waitGone(vite.pid, 10000)) kill(vite.pid); })(); };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', ...(WINDOWS ? ['SIGBREAK'] : [])]) {
    process.on(signal, () => { if (signal !== 'SIGINT' && signal !== 'SIGBREAK' && !WINDOWS) { try { vite.kill(signal); } catch { /* gone */ } } stop(); });
  }
  const code = await exited;
  rmSync(pidFile, { force: true });
  return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
