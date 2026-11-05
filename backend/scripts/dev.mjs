#!/usr/bin/env node
/**
 * Starts the PUT Checks backend locally (Spring Boot, `local` profile, embedded Postgres) plus the Core stand-in it
 * needs for guided Studio. Plain Node, no bash and no Docker: Windows, macOS and Linux. It depends only on this folder
 * and, optionally, the shared local directory the studio-runner prepares ($PUT_CHECKS_LOCAL_DIR). See README.md,
 * "Run locally".
 *
 *   node scripts/dev.mjs [--seed] [-h|--help]
 *
 * Process tracking: PID files in <local dir>/pids/ (backend.json for the bootRun JVM, core.json for the stand-in)
 * replace any lsof/ps discovery. A leftover of this checkout that still holds its port is stopped; any other listener
 * is reported and left alone. The bootRun JVM is forked by the Gradle daemon, not by this script, so it is outside
 * every process tree here: it reports its own PID through /actuator/info (management.info.process.enabled, local only).
 * Stopping: POSIX signals each process group, as before. Windows has no signals to send: the console delivers Ctrl+C
 * to every child itself, and whatever is still running after the grace period is ended with `taskkill /PID <pid> /T /F`.
 */
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const BACKEND_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE_SCRIPT = join(BACKEND_DIR, 'scripts', 'local-core.mjs');
const WRAPPER_PROPERTIES = join(BACKEND_DIR, 'gradle', 'wrapper', 'gradle-wrapper.properties');
const WINDOWS = process.platform === 'win32';

// ── Output ──────────────────────────────────────────────────────────
const color = (code) => (text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const [red, green, yellow, cyan, bold] = ['0;31', '0;32', '0;33', '0;36', '1'].map(color);
const log = (message) => console.log(`${cyan('[backend]')} ${message}`);
const ok = (message) => console.log(`${green('[✓]')} ${message}`);
const warn = (message) => console.log(`${yellow('[!]')} ${message}`);
const err = (message) => console.log(`${red('[✗]')} ${message}`);

export function usage() {
  return `${bold('Usage:')} node scripts/dev.mjs [--seed] [-h]

Start the backend locally: Spring Boot (local profile, embedded Postgres) with hot reload, and
the Core stand-in (guided Studio re-checks the caller against Core).
Start the studio-runner first (node scripts/dev.mjs in studio-runner/) so Studio runs have a
browser runner to dispatch to.

${bold('Options:')}
  --seed        Start with the local,dev profile (3 CSIs, 15 checks, sample executions)
  -h, --help    Show this help

${bold('Environment:')} (a .env.local in backend/ is loaded when present)
  PUT_CHECKS_LOCAL_DIR      shared local directory (default $HOME/.put-checks/local);
                            backend.env there, written by the studio-runner launcher, wires the runner
  PUT_CHECKS_BACKEND_PORT   backend port (default 8080)
  PUT_CHECKS_CORE_PORT      Core stand-in port (default 8081)
  PUT_CHECKS_FRONTEND_PORT  frontend port, added to the CORS origins (default 5173)
  JAVA_HOME                 the JDK 21 Gradle runs on (otherwise java on PATH)
  GRADLE_DISTRIBUTION_URL   Override Gradle wrapper distribution URL for this run only
  STUDIO_GATEWAY_PROVIDER   disabled (default) or vertex; vertex also needs
                            STUDIO_GATEWAY_ENDPOINT, _PROJECT, _LOCATION and credentials (ADC)
  STUDIO_GATEWAY_MODEL      translation model (default gemini-3.8-flash)`;
}

// ── Pure parts (exported so they can be checked without starting anything) ──

/**
 * Reads a dotenv file (.env.local, backend.env): `KEY=value` lines, `#` comments, an optional `export ` prefix and
 * optional matching quotes, taken literally (no escapes, no `$VAR` expansion).
 */
export function parseEnvFile(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(raw);
    if (!match) continue;
    const value = match[2].trim(), quote = value[0];
    values[match[1]] = (quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote)
      ? value.slice(1, -1) : value.replace(/\s+#.*$/, '');
  }
  return values;
}

/**
 * The backend's environment: the caller's (with .env.local already merged), then backend.env from the shared
 * directory, then the local wiring. Returns it with whether the runner was wired.
 */
export function backendEnvironment({ env, localDir, backendPort, corePort, frontendPort }) {
  const out = { ...env, PUT_CHECKS_CORE_PORT: corePort, SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE: 'true' };
  // The studio-runner launcher writes backend.env: the runner's URL, both service tokens, the TLS stores, the shared
  // evidence directory and a config overlay that turns on the guided bridge. Without it the backend still starts, but
  // a Studio run closes ERROR/DISPATCH_FAILED.
  const file = join(localDir, 'backend.env');
  const runnerWired = existsSync(file);
  if (runnerWired) Object.assign(out, parseEnvFile(readFileSync(file, 'utf8')));
  // Guided publication and replay re-check the caller against Core; locally that is the stand-in.
  out.CHECKS_CORE_SERVICE_URL = `http://localhost:${corePort}`;
  // The dev proxy forwards the browser's Origin, and the backend's CORS list names only the default dev ports: any
  // other frontend port would get 403 "Invalid CORS request" on every POST.
  if (!out.CHECKS_CORS_ALLOWED_ORIGINS) {
    const origins = ['http://localhost:3000', 'http://localhost:3002', 'http://localhost:5173'];
    if (!origins.includes(`http://localhost:${frontendPort}`)) origins.push(`http://localhost:${frontendPort}`);
    out.CHECKS_CORS_ALLOWED_ORIGINS = origins.join(',');
  }
  // Local default is disabled (the backend accepts only disabled or vertex). Set vertex in .env.local, with endpoint,
  // project and location, to let Run Test learn.
  out.STUDIO_GATEWAY_PROVIDER = out.STUDIO_GATEWAY_PROVIDER || 'disabled';
  out.STUDIO_GATEWAY_MODEL = out.STUDIO_GATEWAY_MODEL || 'gemini-3.8-flash';
  // The bootRun JVM reports its PID in /actuator/info, which is how this script finds and later stops it.
  out.MANAGEMENT_INFO_PROCESS_ENABLED = 'true';
  return { env: out, runnerWired };
}

/**
 * The two Gradle runs (bootRun and the continuous `classes` build). On Windows the wrapper is gradlew.bat, which only
 * cmd can run: the command is one string for the shell, with the --args value quoted.
 */
export function gradleRuns({ seed, backendPort, platform = process.platform }) {
  const profile = seed ? 'local,dev' : 'local';
  const runs = [
    { label: 'Gradle bootRun client', args: ['bootRun', `--args=--spring.profiles.active=${profile} --server.port=${backendPort}`, '--console=plain', '-q'] },
    { label: 'file watcher', args: ['-t', 'classes', '-x', 'spotlessCheck', '-x', 'checkstyleMain', '--console=plain', '-q'] },
  ];
  return runs.map(({ label, args }) => (platform === 'win32'
    ? { label, command: ['gradlew.bat', ...args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg))].join(' '), args: [], shell: true }
    : { label, command: './gradlew', args, shell: false }));
}

// ── Process helpers ─────────────────────────────────────────────────

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

async function waitGone(target, ms) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(250)) if (!isAlive(target)) return true;
  return !isAlive(target);
}

function taskkill(pid) {
  const exe = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe');
  try { execFileSync(existsSync(exe) ? exe : 'taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
}

/** POSIX: SIGTERM (to the group when `group`), KILL after the grace. Windows: wait out a console Ctrl+C, then taskkill /T /F. */
async function stopProcess(pid, { group = false, graceMs, interrupted = false }) {
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

const pidPath = (dir, name) => join(dir, 'pids', `${name}.json`);
const sameDir = (a, b) => (WINDOWS ? a.toLowerCase() === b.toLowerCase() : a === b);
function writePidFile(dir, name, record) {
  mkdirSync(join(dir, 'pids'), { recursive: true, mode: 0o700 });
  writeFileSync(`${pidPath(dir, name)}.tmp`, JSON.stringify(record), { mode: 0o600 });
  renameSync(`${pidPath(dir, name)}.tmp`, pidPath(dir, name));
}
function readPidFile(dir, name) { try { return JSON.parse(readFileSync(pidPath(dir, name), 'utf8')); } catch { return null; } }
const removePidFile = (dir, name) => rmSync(pidPath(dir, name), { force: true });

/** Stops a leftover of this checkout that still holds `port`; reports anybody else. Returns an error message or null. */
async function freePort({ dir, name, port, label }) {
  const previous = readPidFile(dir, name);
  if (previous && previous.port === port && isAlive(previous.pid) && await portBusy(port)) {
    if (!sameDir(previous.checkout ?? '', BACKEND_DIR)) {
      return `Port ${port} (${label}) is held by PID ${previous.pid}, started from ${previous.checkout}, not from this checkout. Stop it yourself, or set PUT_CHECKS_BACKEND_PORT / PUT_CHECKS_CORE_PORT to a free port.`;
    }
    warn(`Stopping the previous ${label} still listening on :${port} (PID ${previous.pid})`);
    await stopProcess(previous.pid, { group: previous.group === true, graceMs: 30000 });
  }
  if (previous && !isAlive(previous.pid)) removePidFile(dir, name);
  if (await portBusy(port)) {
    return `Port ${port} (${label}) is in use by a process this launcher did not start. Stop it yourself, or set PUT_CHECKS_BACKEND_PORT / PUT_CHECKS_CORE_PORT to a free port.`;
  }
  return null;
}

async function httpGet(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return { status: response.status, body: await response.text() };
  } catch { return { status: 0, body: '' }; }
}

/** The bootRun JVM's PID, from its /actuator/info `process` section (null while starting or when absent). */
async function jvmPid(port) {
  const { status, body } = await httpGet(`http://127.0.0.1:${port}/actuator/info`);
  if (status !== 200) return null;
  try { return Number(JSON.parse(body).process?.pid) || null; } catch { return null; }
}

// ── Java ────────────────────────────────────────────────────────────
const javaIn = (home) => join(home, 'bin', WINDOWS ? 'java.exe' : 'java');
function javaVersion(java) {
  const result = spawnSync(java, ['-version'], { encoding: 'utf8' });
  return result.status === 0 ? `${result.stderr}${result.stdout}` : null;
}
const is21 = (output) => output !== null && /"21\./.test(output);

/** JAVA_HOME, else java on PATH; when neither is 21, macOS also looks where JDK 21 usually lives (as before). */
function resolveJava(env) {
  if (env.JAVA_HOME) {
    const version = javaVersion(javaIn(env.JAVA_HOME));
    if (version === null) return { error: `JAVA_HOME (${env.JAVA_HOME}) has no working bin/java. Point it at a JDK 21.` };
    if (!is21(version)) warn(`JAVA_HOME (${env.JAVA_HOME}) is not JDK 21 — Gradle toolchain will attempt auto-provisioning`);
    return {};
  }
  const onPath = javaVersion('java');
  if (is21(onPath)) return {};
  if (process.platform === 'darwin') {
    const probe = spawnSync('/usr/libexec/java_home', ['-v', '21'], { encoding: 'utf8' });
    const jdks = join(homedir(), '.jdks');
    const candidates = [probe.status === 0 ? probe.stdout.trim() : '', '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
      ...(existsSync(jdks) ? readdirSync(jdks).filter((name) => name.includes('21')).map((name) => join(jdks, name, 'Contents', 'Home')) : [])];
    const found = candidates.find((home) => home && existsSync(javaIn(home)) && is21(javaVersion(javaIn(home))));
    if (found) { env.JAVA_HOME = found; ok(`Using JDK 21 at ${found}`); return {}; }
  }
  if (onPath === null) return { error: 'Java not found. Install JDK 21 and set JAVA_HOME (or put its bin on PATH).' };
  warn('JDK 21 not found — Gradle toolchain will attempt auto-provisioning');
  return {};
}

// ── Main ────────────────────────────────────────────────────────────
async function main(argv) {
  let seed = false;
  for (const arg of argv) {
    if (arg === '--seed') seed = true;
    else if (arg === '-h' || arg === '--help') { console.log(usage()); return 0; }
    else { err(`Unknown option: ${arg}`); console.log(usage()); return 1; }
  }

  // .env.local (secrets not committed to git) is read before anything below uses it.
  const env = { ...process.env };
  const envLocal = join(BACKEND_DIR, '.env.local');
  if (existsSync(envLocal)) { Object.assign(env, parseEnvFile(readFileSync(envLocal, 'utf8'))); ok('Loaded .env.local'); }

  // ── Prerequisites
  const java = resolveJava(env);
  const wrapper = join(BACKEND_DIR, WINDOWS ? 'gradlew.bat' : 'gradlew');
  const problems = [java.error, !existsSync(wrapper) && `${wrapper} not found`].filter(Boolean);
  if (problems.length) { for (const problem of problems) err(problem); err('Prerequisites not met. Fix the issues above and retry.'); return 1; }
  ok('Prerequisites OK');

  const backendPort = Number(env.PUT_CHECKS_BACKEND_PORT || 8080), corePort = Number(env.PUT_CHECKS_CORE_PORT || 8081);
  const frontendPort = Number(env.PUT_CHECKS_FRONTEND_PORT || 5173);
  for (const [name, value] of [['PUT_CHECKS_BACKEND_PORT', backendPort], ['PUT_CHECKS_CORE_PORT', corePort], ['PUT_CHECKS_FRONTEND_PORT', frontendPort]]) {
    if (!Number.isInteger(value) || value < 1 || value > 65535) { err(`${name} must be a port number.`); return 1; }
  }
  const localDir = resolve(env.PUT_CHECKS_LOCAL_DIR || join(env.HOME || homedir(), '.put-checks', 'local'));

  // ── Ports: stop a leftover of this checkout, never anything else
  for (const [name, port, label] of [['backend', backendPort, 'backend'], ['core', corePort, 'Core stand-in']]) {
    const busy = await freePort({ dir: localDir, name, port, label });
    if (busy) { err(busy); return 1; }
  }

  // ── Optional Gradle wrapper URL override (session only, restored on exit)
  let wrapperBackup = null;
  const restoreWrapper = () => {
    if (wrapperBackup && existsSync(wrapperBackup)) { copyFileSync(wrapperBackup, WRAPPER_PROPERTIES); rmSync(dirname(wrapperBackup), { recursive: true, force: true }); wrapperBackup = null; log('Restored Gradle wrapper configuration'); }
  };
  process.on('exit', restoreWrapper);
  if (env.GRADLE_DISTRIBUTION_URL) {
    if (!existsSync(WRAPPER_PROPERTIES)) warn(`Gradle wrapper properties not found: ${WRAPPER_PROPERTIES}`);
    else {
      const text = readFileSync(WRAPPER_PROPERTIES, 'utf8');
      const line = `distributionUrl=${env.GRADLE_DISTRIBUTION_URL}`;
      if (/^distributionUrl=(.*)$/m.exec(text)?.[1] === env.GRADLE_DISTRIBUTION_URL) ok('Gradle distribution URL already configured');
      else {
        wrapperBackup = join(mkdtempSync(join(tmpdir(), 'gradle-wrapper-')), 'gradle-wrapper.properties');
        copyFileSync(WRAPPER_PROPERTIES, wrapperBackup);
        writeFileSync(WRAPPER_PROPERTIES, /^distributionUrl=/m.test(text) ? text.replace(/^distributionUrl=.*$/m, line) : `${text}${text.endsWith('\n') ? '' : '\n'}${line}\n`);
        ok('Applied Gradle distribution override for this run');
      }
    }
  }

  const { env: childEnv, runnerWired } = backendEnvironment({ env, localDir, backendPort, corePort, frontendPort });
  if (runnerWired) ok(`Studio runner wiring loaded from ${join(localDir, 'backend.env')}`);
  else warn('studio-runner not prepared: start it first (node scripts/dev.mjs in studio-runner/); Studio runs will close ERROR/DISPATCH_FAILED');

  // ── Cleanup (wired before the first child starts)
  // Only what this script started is stopped. On POSIX every child gets its own process group, so a group signal
  // reaches the whole tree it spawned (the Gradle client, the watcher) and nothing outside it. The Gradle daemon itself
  // is shared and was not necessarily started here, so it is left alone.
  let core = null, bootRun = null, watcher = null, appPid = null, cleaned = false;
  const running = (child) => child !== null && child.exitCode === null && child.signalCode === null;
  const cleanup = async (interrupted) => {
    if (cleaned) return;
    cleaned = true;
    log('Shutting down…');
    const stop = async (child, label, graceMs) => {
      if (!running(child)) return;
      log(`Stopping ${label}…`);
      await stopProcess(child.pid, { group: !WINDOWS, graceMs, interrupted });
    };
    await stop(watcher, 'file watcher', 10000);
    if (running(bootRun) && !appPid) appPid = await jvmPid(backendPort);
    await stop(bootRun, 'Gradle bootRun client', 10000);
    if (appPid && isAlive(appPid)) {
      log(`Stopping backend JVM (PID ${appPid})…`);
      await stopProcess(appPid, { graceMs: 30000, interrupted });
    }
    await stop(core, 'Core stand-in', 10000);
    removePidFile(localDir, 'backend'); removePidFile(localDir, 'core');
    restoreWrapper();
    log('Done.');
  };
  const onSignal = (code, interrupted) => () => { void cleanup(interrupted).then(() => process.exit(code)); };
  process.on('SIGINT', onSignal(130, true));
  process.on('SIGTERM', onSignal(143, false));
  process.on('SIGHUP', onSignal(129, false));
  if (WINDOWS) process.on('SIGBREAK', onSignal(131, true));
  const fail = async (message) => { err(message); await cleanup(false); return 1; };

  // ── Core stand-in
  log(`Starting Core stand-in (:${corePort})…`);
  core = spawn(process.execPath, [CORE_SCRIPT], { cwd: BACKEND_DIR, env: childEnv, stdio: ['ignore', 'inherit', 'inherit'], detached: !WINDOWS });
  writePidFile(localDir, 'core', { pid: core.pid, port: corePort, checkout: BACKEND_DIR, group: !WINDOWS });
  let coreReady = false;
  for (let i = 0; i < 20 && running(core); i += 1) {
    // 401 without the cookie is the stand-in answering.
    if ((await httpGet(`http://127.0.0.1:${corePort}/api/v1/users/me`)).status === 401) { coreReady = true; break; }
    await sleep(250);
  }
  if (!coreReady) return fail(`Core stand-in did not start on :${corePort}`);

  // ── Backend
  log(`Starting backend (Spring Boot :${backendPort}${seed ? ', sample data enabled' : ''})…`);
  const [bootRunSpec, watcherSpec] = gradleRuns({ seed, backendPort });
  const gradle = (spec) => spawn(spec.command, spec.args, { cwd: BACKEND_DIR, env: childEnv, shell: spec.shell, stdio: ['ignore', 'inherit', 'inherit'], detached: !WINDOWS });
  bootRun = gradle(bootRunSpec);
  log(`Backend PID: ${bootRun.pid}`);
  // Continuous compilation: DevTools restarts the app on classpath changes. Each restart gets a fresh embedded database.
  watcher = gradle(watcherSpec);
  log(`File watcher PID: ${watcher.pid} (hot reload via DevTools)`);

  // `/actuator/health` includes database-backed operational indicators and can legitimately wait on their own bounds.
  // Local startup only needs proof that the HTTP application is serving.
  log('Waiting for backend health…');
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    const { status } = await httpGet(`http://127.0.0.1:${backendPort}/actuator/info`);
    if (status === 200) { ready = true; appPid = await jvmPid(backendPort); break; }
    if (!running(bootRun)) return fail('Backend process exited unexpectedly');
    await sleep(2000);
  }
  if (ready) {
    ok('Backend healthy');
    if (appPid) writePidFile(localDir, 'backend', { pid: appPid, port: backendPort, checkout: BACKEND_DIR, group: false });
    else warn('The backend JVM did not report its PID; Ctrl+C stops Gradle, which ends bootRun');
  } else warn('Backend not healthy after 120s — still starting; API calls fail until it is ready');

  console.log('');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  ok(`Backend:     http://localhost:${backendPort}`);
  ok(`Swagger UI:  http://localhost:${backendPort}/swagger-ui.html`);
  ok(`Health:      http://localhost:${backendPort}/actuator/health`);
  ok(`Core:        http://localhost:${corePort} (stand-in)`);
  ok('Hot reload:  enabled (DevTools + continuous compilation; the embedded database resets on each restart)');
  if (seed) ok('Profile:     dev (3 CSIs, 15 checks, ~450 execution results)');
  if (runnerWired) ok(`Runner:      wired yes (${childEnv.STUDIO_RUNNER_BASE_URL || 'see backend.env'})`);
  else warn('Runner:      wired no — Studio runs will close ERROR/DISPATCH_FAILED');
  if (childEnv.STUDIO_GATEWAY_PROVIDER === 'disabled') ok('Translate:   disabled (Run Test answers learning unavailable; see README for vertex)');
  else ok(`Translate:   ${childEnv.STUDIO_GATEWAY_PROVIDER} (${childEnv.STUDIO_GATEWAY_MODEL})`);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('Press Ctrl+C to stop');
  console.log('');

  // ── Keep alive until a child exits or Ctrl+C
  while (running(bootRun)) {
    if (!running(core)) return cleaned ? new Promise((never) => void never) : fail('Core stand-in exited unexpectedly');
    await sleep(1000);
  }
  if (cleaned) return new Promise((never) => void never); // a signal handler is finishing and exits with its own code
  return fail('Backend process exited');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
