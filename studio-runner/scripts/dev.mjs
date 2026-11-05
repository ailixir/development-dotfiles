#!/usr/bin/env node
/**
 * Starts the studio-runner locally (no Docker, no bash): the first of the three local starts (runner, backend,
 * frontend). It depends only on this folder; the other components share state with it through one directory
 * (PUT_CHECKS_LOCAL_DIR), which this script fills in. See README.md, "Run locally". Windows, macOS and Linux.
 *
 *   node scripts/dev.mjs [-h|--help]
 *
 * Process tracking: the runner's PID file is <local dir>/pids/studio-runner.json. A leftover runner of this checkout
 * (its PID alive and the port busy) is stopped; any other listener on the port is reported and left alone.
 * Stopping: POSIX signals the runner's PID (it drains, up to 30 s, then KILL). On Windows the console delivers Ctrl+C
 * to the runner itself; after 30 s anything left is ended with `taskkill /PID <pid> /T /F`.
 */
// The local-start tooling spawns npm, Playwright's installer, the token issuer and the runner. It never sees artifact
// content and passes only arguments written here, so ADR-001 §6 (no child_process in the shipped package) is untouched.
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { constants } from 'node:os';
import { connect, createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { browserExecutableRelativePath, envBrowserRoot } from './browser-provenance.mjs';
import { defaultDir, envGet, findOpenssl, health, init, keytool, parseEnvFile, startRunner } from './local-stack.mjs';
import { readChromiumBuild } from './write-runtime-versions.mjs';

const RUNNER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WINDOWS = process.platform === 'win32';

// ── Output ──────────────────────────────────────────────────────────
const color = (code) => (text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const [red, green, yellow, cyan, bold] = ['0;31', '0;32', '0;33', '0;36', '1'].map(color);
const log = (message) => console.log(`${cyan('[studio-runner]')} ${message}`);
const ok = (message) => console.log(`${green('[✓]')} ${message}`);
const warn = (message) => console.log(`${yellow('[!]')} ${message}`);
const err = (message) => console.error(`${red('[✗]')} ${message}`);

function usage() {
  return `${bold('Usage:')} node scripts/dev.mjs [-h|--help]

Build and start the studio-runner on https://127.0.0.1:8090 (mutual TLS) with guided learning and
observed replay on, plus the local token issuer. Runs in the foreground; Ctrl+C drains the runner
(up to 30 s) and stops the issuer. Nothing else is touched.

The local TLS, service identities, guided tokens and the files the backend needs are written to
$PUT_CHECKS_LOCAL_DIR and reused on every start, so the runner can restart on its own.
Start the backend (node scripts/dev.mjs in backend/) and then the frontend (node scripts/dev.mjs
in frontend/) after it.

${bold('Prerequisites:')} Node 24, openssl (on Windows: Git for Windows ships it) and a JDK keytool
(JDK 21, JAVA_HOME). The pinned Chromium is installed into PLAYWRIGHT_BROWSERS_PATH when missing.

${bold('Environment')} (also read from studio-runner/.env.local when present):
  PUT_CHECKS_LOCAL_DIR     shared directory (default $HOME/.put-checks/local)
  PUT_CHECKS_RUNNER_PORT   runner port (default 8090)
  PUT_CHECKS_BACKEND_PORT  backend port the runner reports back to (default 8080)
  PUT_CHECKS_GUIDED_PORT   backend guided connector port (default 8092)
  STUDIO_ALLOW_ALL_DOMAINS true|false, passed to the runner as STUDIO_RUNNER_ALLOW_ALL_DOMAINS
  STUDIO_RUNNER_SERVICE_TOKEN / STUDIO_CALLBACK_SERVICE_TOKEN
                           use these identities instead of the stored ones
  STUDIO_RUNNER_TLS_*      complete explicit TLS files instead of the generated local CA
  PLAYWRIGHT_BROWSERS_PATH where Chromium is installed (default $PUT_CHECKS_LOCAL_DIR/ms-playwright-<pinned
                           playwright version>, one revision only)
  PLAYWRIGHT_DOWNLOAD_HOST mirror Playwright downloads Chromium from (e.g. the bank Artifactory)
  JAVA_HOME                the JDK whose bin/keytool is used`;
}

// ── Process helpers (exported for scripts/local-stack.check.mjs) ────

/** True while `pid` (or, negative, a POSIX process group) exists. EPERM still means it exists. */
export function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

/**
 * True when something listens on `port`. A connect probe first (binds nothing), then a bind test on every loopback and
 * wildcard address: macOS and Windows let a specific address bind next to a wildcard listener, so one bind is not enough.
 */
export async function portBusy(port) {
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

function taskkill(pid) {
  const exe = join(envGet(process.env, 'SystemRoot') ?? 'C:\\Windows', 'System32', 'taskkill.exe');
  try { execFileSync(existsSync(exe) ? exe : 'taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
}

/**
 * Stops one process this launcher owns. POSIX: SIGTERM to the PID (or `-pid`, the group, when `group`), KILL after
 * `graceMs`. Windows: a signal from here would be a hard kill, so after a console Ctrl+C (`interrupted`) the process is
 * given `graceMs` to finish on its own; then, or right away otherwise, `taskkill /T /F` ends its whole tree.
 */
export async function stopProcess(pid, { group = false, graceMs = 30000, interrupted = false } = {}) {
  if (!pid) return;
  if (!WINDOWS) {
    const target = group ? -pid : pid;
    if (!isAlive(target)) return;
    try { process.kill(target, 'SIGTERM'); } catch { return; }
    if (await waitGone(target, graceMs)) return;
    try { process.kill(target, 'SIGKILL'); } catch { /* gone */ }
    await waitGone(target, 2000);
    return;
  }
  if (!isAlive(pid)) return;
  if (interrupted && await waitGone(pid, graceMs)) return;
  taskkill(pid);
  await waitGone(pid, 5000);
}

const pidFile = (dir, name) => join(dir, 'pids', `${name}.json`);
const sameDir = (a, b) => (WINDOWS ? a.toLowerCase() === b.toLowerCase() : a === b);

/** Records a process this launcher started: who it is, which checkout started it, which port it holds. */
export function writePidFile(dir, name, record) {
  mkdirSync(join(dir, 'pids'), { recursive: true, mode: 0o700 });
  const temp = `${pidFile(dir, name)}.tmp`;
  writeFileSync(temp, JSON.stringify(record), { mode: 0o600 });
  renameSync(temp, pidFile(dir, name));
}
export function readPidFile(dir, name) {
  try { return JSON.parse(readFileSync(pidFile(dir, name), 'utf8')); } catch { return null; }
}
export const removePidFile = (dir, name) => rmSync(pidFile(dir, name), { force: true });

/**
 * Frees `port` for a new start. A previous instance recorded in the PID file is stopped only when it came from this
 * checkout, is still alive and the port is still busy (a reused PID with a free port is just a stale file). Anything
 * else on the port is somebody else's and is reported, never signalled. Returns an error message, or null when free.
 */
export async function freePort({ dir, name, port, checkout, label, hint, graceMs = 30000 }) {
  const previous = readPidFile(dir, name);
  if (previous && previous.port === port && isAlive(previous.pid) && await portBusy(port)) {
    if (!sameDir(previous.checkout ?? '', checkout)) {
      return `Port ${port} is held by PID ${previous.pid}, a ${label} started from ${previous.checkout}, not from ${checkout}. ${hint}`;
    }
    warn(`Stopping the ${label} already on port ${port} (PID ${previous.pid})…`);
    await stopProcess(previous.pid, { group: previous.group === true, graceMs });
    if (isAlive(previous.pid)) return `PID ${previous.pid} is still running after ${graceMs / 1000} s; stop it yourself and retry.`;
  }
  if (previous && !isAlive(previous.pid)) removePidFile(dir, name);
  if (await portBusy(port)) return `Port ${port} is in use by a process this launcher did not start. Stop it yourself or ${hint}`;
  return null;
}

/** Runs a tool to completion with the terminal attached. npm is a .cmd on Windows, which needs the shell. */
function run(command, args, options) {
  const result = WINDOWS
    ? spawnSync([command, ...args].join(' '), { ...options, shell: true, stdio: options.stdio ?? 'inherit' })
    : spawnSync(command, args, { ...options, stdio: options.stdio ?? 'inherit' });
  return result.status === 0;
}

/** JAVA_HOME, else (macOS, as before) JDK 21 from java_home or Homebrew; keytool comes from JAVA_HOME/bin or PATH. */
function resolveKeytool(env) {
  if (!env.JAVA_HOME && process.platform === 'darwin') {
    const probe = spawnSync('/usr/libexec/java_home', ['-v', '21'], { encoding: 'utf8' });
    const brew = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
    if (probe.status === 0 && probe.stdout.trim()) env.JAVA_HOME = probe.stdout.trim();
    else if (existsSync(brew)) env.JAVA_HOME = brew;
  }
  const tool = keytool(env);
  if (env.JAVA_HOME) {
    if (!existsSync(tool)) return `keytool not found in JAVA_HOME (${env.JAVA_HOME}). Install JDK 21 and point JAVA_HOME at it.`;
  } else if (spawnSync(tool, ['-help'], { stdio: 'ignore' }).status !== 0) {
    return 'keytool (JDK) not found. Install JDK 21 and set JAVA_HOME (macOS: brew install openjdk@21).';
  }
  return null;
}

/** Where the pinned Chromium is (same layout and revision the runner checks at startup), and whether it is complete. */
function chromiumInstalled(env) {
  const registry = JSON.parse(readFileSync(join(RUNNER_DIR, 'node_modules', 'playwright-core', 'browsers.json'), 'utf8'));
  const revision = registry.browsers.find((browser) => browser.name === 'chromium')?.revision;
  const directory = join(envBrowserRoot(env), `chromium-${revision}`);
  return existsSync(join(directory, 'INSTALLATION_COMPLETE')) && existsSync(join(directory, browserExecutableRelativePath()));
}

// ── Main ────────────────────────────────────────────────────────────
async function main(argv) {
  if (argv.length > 0) {
    if (argv.length === 1 && ['-h', '--help'].includes(argv[0])) { console.log(usage()); return 0; }
    err(`Unknown option: ${argv[0]}`); console.error(usage()); return 1;
  }

  // .env.local (gitignored) holds per-developer overrides; read before anything below uses them.
  const env = { ...process.env };
  const envLocal = join(RUNNER_DIR, '.env.local');
  if (existsSync(envLocal)) { Object.assign(env, parseEnvFile(readFileSync(envLocal, 'utf8'))); ok('Loaded .env.local'); }
  const dir = resolve(defaultDir(env));
  env.PUT_CHECKS_LOCAL_DIR = dir;
  env.PUT_CHECKS_RUNNER_PORT = env.PUT_CHECKS_RUNNER_PORT || '8090';
  const port = Number(env.PUT_CHECKS_RUNNER_PORT);
  // A browsers root per pinned Playwright version, outside the package (so lint and the sandbox scan never walk
  // Chromium): the OS-wide one (~/Library/Caches, %LOCALAPPDATA%\ms-playwright) can hold another checkout's
  // revision too, and the build refuses a root with two (ADR-001 §4.2).
  const pinnedPlaywright = JSON.parse(readFileSync(join(RUNNER_DIR, 'package.json'), 'utf8')).dependencies.playwright;
  env.PLAYWRIGHT_BROWSERS_PATH = env.PLAYWRIGHT_BROWSERS_PATH || join(dir, `ms-playwright-${pinnedPlaywright}`);

  // ── Prerequisites
  if (process.versions.node.split('.')[0] !== '24') {
    err(`Node 24 is required (found ${process.version}); studio-runner/.nvmrc pins it. Switch with fnm/nvm and retry.`);
    return 1;
  }
  if (!run('npm', ['--version'], { cwd: RUNNER_DIR, env, stdio: 'ignore' })) { err('npm not found on PATH.'); return 1; }
  try { findOpenssl(env); } catch (error) { err(error.message); return 1; }
  const keytoolProblem = resolveKeytool(env);
  if (keytoolProblem) { err(keytoolProblem); return 1; }

  if (!existsSync(join(RUNNER_DIR, 'node_modules'))) {
    log('Installing dependencies (npm ci)…');
    if (!run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: RUNNER_DIR, env })) { err('npm ci failed.'); return 1; }
  }

  // Playwright's own layout for the pinned Chromium; the runner launches exactly that build.
  if (!chromiumInstalled(env)) {
    log(`Installing the pinned Chromium into ${env.PLAYWRIGHT_BROWSERS_PATH}…`);
    if (!run(process.execPath, [join(RUNNER_DIR, 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium'], { cwd: RUNNER_DIR, env }) || !chromiumInstalled(env)) {
      err('The pinned Chromium could not be installed. Behind a mirror, set PLAYWRIGHT_DOWNLOAD_HOST and retry.');
      return 1;
    }
  }
  try { readChromiumBuild(env.PLAYWRIGHT_BROWSERS_PATH); } catch (error) { err(error.message); return 1; }

  log('Building studio-runner…');
  if (!run('npm', ['run', 'build', '--silent'], { cwd: RUNNER_DIR, env })) { err('The build failed.'); return 1; }

  // ── Port
  const busy = await freePort({ dir, name: 'studio-runner', port, checkout: RUNNER_DIR, label: 'studio-runner',
    hint: 'choose another port with PUT_CHECKS_RUNNER_PORT.' });
  if (busy) { err(busy); return 1; }

  // ── Shared material
  try {
    const result = init(dir, env);
    if (result.catalogChanged) log('The runner build changed (new catalog): restart the backend so it picks up catalog.json.');
    if (result.tlsRegenerated) log('Local TLS was regenerated (the old certificates were near expiry or unusable): restart the backend.');
  } catch (error) {
    // Only our fixed messages are printed; parser/tool exceptions may contain private file values.
    err(/^(Local TLS|Local stack|Partial local TLS|STUDIO_RUNNER_|Runner TLS)/.test(error.message) ? error.message
      : 'Local stack preparation failed; verify the complete TLS configuration and installed OpenSSL/JDK tools.');
    return 1;
  }
  ok(`Local material ready in ${dir}`);

  // Signals are wired before the first child starts, so no window leaves one behind.
  let issuer = null, runner = null, cleaned = false;
  const running = (child) => child !== null && child.exitCode === null && child.signalCode === null;
  const cleanup = async (interrupted) => {
    if (cleaned) return;
    cleaned = true;
    if (running(runner)) {
      log('Stopping studio-runner (drain)…');
      await stopProcess(runner.pid, { graceMs: 30000, interrupted });
    }
    if (running(issuer)) {
      log('Stopping the token issuer…');
      await stopProcess(issuer.pid, { graceMs: 5000, interrupted });
    }
    removePidFile(dir, 'studio-runner');
    log('Done.');
  };
  const onSignal = (code, interrupted) => () => { void cleanup(interrupted).then(() => process.exit(code)); };
  process.on('SIGINT', onSignal(130, true));
  process.on('SIGTERM', onSignal(143, false));
  process.on('SIGHUP', onSignal(129, false));
  if (WINDOWS) process.on('SIGBREAK', onSignal(131, true));

  // The tokens exist before the runner starts; the issuer then refreshes them every 30 s.
  const tokens = join(RUNNER_DIR, 'scripts', 'local-tokens.mjs');
  if (!run(process.execPath, [tokens, 'once'], { cwd: RUNNER_DIR, env })) { err('The token issuer could not mint the guided tokens.'); return 1; }
  const issuerLog = openSync(join(dir, 'logs', 'issuer.log'), 'a', 0o600);
  issuer = spawn(process.execPath, [tokens, 'serve'], { cwd: RUNNER_DIR, env, stdio: ['ignore', issuerLog, issuerLog], detached: !WINDOWS });
  closeSync(issuerLog);

  // ── Runner (environment enumerated from runner-environment.json; see startRunner)
  const runnerLog = openSync(join(dir, 'logs', 'runner.log'), 'w', 0o600);
  runner = startRunner(dir, { cwd: RUNNER_DIR, stdio: ['ignore', runnerLog, runnerLog] });
  closeSync(runnerLog);
  const runnerExit = new Promise((done) => runner.once('exit', (code, signal) => done(code ?? 128 + (constants.signals[signal] ?? 0))));
  writePidFile(dir, 'studio-runner', { pid: runner.pid, port, checkout: RUNNER_DIR, group: false });
  log(`studio-runner PID: ${runner.pid}`);

  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
    if (await health(dir)) { ready = true; break; }
    if (!running(runner)) {
      err(`studio-runner exited during startup (log: ${join(dir, 'logs', 'runner.log')})`);
      await cleanup(false); return 1;
    }
    await sleep(1000);
  }
  if (!ready) {
    err(`studio-runner did not pass mutual-TLS readiness in 30 s (log: ${join(dir, 'logs', 'runner.log')})`);
    await cleanup(false); return 1;
  }

  console.log('');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  ok(`Runner:     https://127.0.0.1:${port} (mutual TLS, guided learning + observed replay on)`);
  ok(`Shared dir: ${dir}`);
  ok(`Log:        ${join(dir, 'logs', 'runner.log')}`);
  log('Next: start the backend, then the frontend (node scripts/dev.mjs in each).');
  log('Press Ctrl+C to stop the runner and the token issuer');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const status = await runnerExit;
  if (cleaned) return new Promise((never) => void never); // a signal handler is finishing and exits with its own code
  err(`studio-runner exited (status ${status}); see ${join(dir, 'logs', 'runner.log')}`);
  await cleanup(false);
  return status;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
