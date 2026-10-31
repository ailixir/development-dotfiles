import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { GATE_DIR } from './common.ts';
import { coreDeclaration } from './stack/core-declaration.mjs';
import { checkDist } from './stack/dist-check.mjs';
import { externalCoreDeclaration } from './environment.ts';
import { fileManifest } from './freeze.ts';
import { DEFAULT_PORTS, LIVE_PORTS, assertFree, gatePorts, isListening } from './stack/ports.mjs';

const STACK = join(GATE_DIR, 'stack');
const NODE_DIR = dirname(process.execPath);
const ENV = { ...process.env, PATH: `${NODE_DIR}:/opt/homebrew/bin:/usr/bin:/bin` } as NodeJS.ProcessEnv;
for (const key of Object.keys(ENV)) if (key.startsWith('CHECKS_GATE_') || key.startsWith('STUDIO_GATEWAY')) delete ENV[key];

function withDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'gate-stack-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const sh = (args: string[], env: NodeJS.ProcessEnv = {}) => spawnSync(args[0] ?? '', args.slice(1), { env: { ...ENV, ...env }, encoding: 'utf8', timeout: 60_000 });

async function withDirAsync<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'gate-stack-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function listen(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = net.createServer();
    const attempt=():void=>{server.once('error',()=>attempt());server.listen(18000+Math.floor(Math.random()*1000),'127.0.0.1',()=>{server.removeAllListeners('error');resolve({port:(server.address() as net.AddressInfo).port,close:()=>new Promise<void>((r)=>server.close(()=>r()))});});};attempt();
  });
}

/** Free high ports, so these tests do not depend on whether a real gate stack is up on the default ports. */
async function freePorts(n: number): Promise<number[]> {
  const holders = await Promise.all(Array.from({ length: n }, () => listen()));
  const ports = holders.map((h) => h.port);
  await Promise.all(holders.map((h) => h.close()));
  return ports;
}

test('default ports avoid the live stack and the env set overrides them', () => {
  const live = new Set<number>(Object.values(LIVE_PORTS));
  assert.deepEqual(Object.values(LIVE_PORTS).sort(), [5181, 8080, 8081, 8090, 8092]);
  for (const port of Object.values(gatePorts({}))) assert.ok(!live.has(port));
  assert.deepEqual(gatePorts({}), DEFAULT_PORTS);
  assert.equal(gatePorts({ CHECKS_GATE_PORT_VAULT: '18300' }).vault, 18300);
  assert.equal(gatePorts({}).app,18177);
  assert.equal(new Set(Object.values(gatePorts({}))).size, 7);
  for(const port of ['14177','28200','17999','19000'])assert.throws(()=>gatePorts({CHECKS_GATE_PORT_APP:port}),/18000 and18999/);
});

test('a live-stack port, a duplicate or a junk value is refused with a clear message', () => {
  for (const [name, port] of [['BACKEND', 8080], ['CORE', 8081], ['RUNNER', 8090], ['CONNECTOR', 8092], ['APP', 5181]] as const) {
    assert.throws(() => gatePorts({ [`CHECKS_GATE_PORT_${name}`]: String(port) }), new RegExp(`CHECKS_GATE_PORT_${name}=${port} is a port of the live dev stack`));
  }
  assert.throws(() => gatePorts({ CHECKS_GATE_PORT_CORE: '18080' }), /both 18080/);
  assert.throws(() => gatePorts({ CHECKS_GATE_PORT_VAULT: 'abc' }), /not an isolated TCP port/);
  assert.throws(() => gatePorts({ CHECKS_GATE_PORT_VAULT: '80' }), /not an isolated TCP port/);
});

test('a port that is already listening fails fast, naming the variable', async () => {
  const held = await listen();
  try {
    assert.equal(await isListening(held.port), true);
    const [spare = 0] = await freePorts(1);
    const ports = { ...gatePorts({}), runner: held.port, connector: spare };
    await assert.rejects(() => assertFree(['runner', 'connector'], ports), new RegExp(`CHECKS_GATE_PORT_RUNNER=${held.port} is already listening`));
    await assertFree(['connector'], ports);
    const cli = sh([process.execPath, join(STACK, 'ports.mjs'), 'check', 'runner'], { CHECKS_GATE_PORT_RUNNER: String(held.port) });
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /already listening/);
  } finally {
    await held.close();
  }
});

test('gen-config.mjs and local-core.mjs refuse a busy port before doing anything', async () => {
  const held = await listen();
  try {
    withDir((dir) => {
      const gen = sh([process.execPath, join(STACK, 'gen-config.mjs')], { CHECKS_GATE_STACK_DIR: dir, CHECKS_GATE_PORT_CONNECTOR: String(held.port) });
      assert.equal(gen.status, 1);
      assert.match(gen.stderr, /CHECKS_GATE_PORT_CONNECTOR=\d+ is already listening/);
      assert.deepEqual(spawnSync('ls', [dir], { encoding: 'utf8' }).stdout.trim(), '', 'nothing was written');
      const live = sh([process.execPath, join(STACK, 'gen-config.mjs')], { CHECKS_GATE_STACK_DIR: dir, CHECKS_GATE_PORT_RUNNER: '8090' });
      assert.equal(live.status, 1);
      assert.match(live.stderr, /live dev stack/);
      const core = sh([process.execPath, join(STACK, 'local-core.mjs')], { CHECKS_GATE_PORT_CORE: String(held.port) });
      assert.equal(core.status, 1);
      assert.match(core.stderr, /already listening/);
      const coreLive = sh([process.execPath, join(STACK, 'local-core.mjs')], { CHECKS_GATE_PORT_CORE: '8081' });
      assert.equal(coreLive.status, 1);
    });
  } finally {
    await held.close();
  }
});

test('the Core stand-in serves only the fixed cookie, on loopback and its gate port', async () => {
  const free = await listen();
  const port = free.port;
  await free.close();
  const child = spawn(process.execPath, [join(STACK, 'local-core.mjs')], { env: { ...ENV, CHECKS_GATE_PORT_CORE: String(port) }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 40 && !(await isListening(port)); i += 1) await new Promise((r) => setTimeout(r, 100));
    const ok = await fetch(`http://127.0.0.1:${port}/api/v1/users/me`, { headers: { cookie: 'put_session=local-dev-session' } });
    assert.equal(ok.status, 200);
    const anon = await fetch(`http://127.0.0.1:${port}/api/v1/users/me`);
    assert.equal(anon.status, 401);
  } finally {
    child.kill('SIGTERM');
  }
});

function runnerTree(dir: string): void {
  mkdirSync(join(dir, 'src/run'), { recursive: true });
  mkdirSync(join(dir, 'dist/run'), { recursive: true });
  writeFileSync(join(dir, 'src/main.ts'), 'export {}');
  writeFileSync(join(dir, 'src/run/a.ts'), 'export {}');
  writeFileSync(join(dir, 'src/run/types.d.ts'), 'export {}');
  writeFileSync(join(dir, 'dist/main.js'), 'export {}');
  writeFileSync(join(dir, 'dist/run/a.js'), 'export {}');
  writeFileSync(join(dir, 'dist/runtime-versions.json'), '{}');
  const later = new Date(Date.now() + 5000);
  for (const f of ['dist/main.js', 'dist/run/a.js']) utimesSync(join(dir, f), later, later);
}

test('dist-check: a current clean dist passes; stale, missing, orphan and old-resolver dists are refused', () => {
  withDir((dir) => {
    runnerTree(dir);
    assert.deepEqual(checkDist(dir), []);
    writeFileSync(join(dir, 'src/run/new.ts'), 'export {}');
    assert.match(checkDist(dir).join(), /src\/run\/new\.ts has no dist\/run\/new\.js/);
    rmSync(join(dir, 'src/run/new.ts'));
    const future = new Date(Date.now() + 60_000);
    utimesSync(join(dir, 'src/run/a.ts'), future, future);
    assert.match(checkDist(dir).join(), /src\/run\/a\.ts is newer than dist\/run\/a\.js/);
    runnerTree(dir);
    writeFileSync(join(dir, 'dist/run/old.js'), 'export {}');
    assert.match(checkDist(dir).join(), /dist\/run\/old\.js has no src counterpart/);
    rmSync(join(dir, 'dist/run/old.js'));
    writeFileSync(join(dir, 'dist/run/a.js'), 'const x = unresolvedRole;');
    assert.match(checkDist(dir).join(), /old resolver/);
    writeFileSync(join(dir, 'dist/run/a.js'), 'const hints = locatorHints;');
    assert.match(checkDist(dir).join(), /old resolver/);
  });
  withDir((dir) => {
    runnerTree(dir);
    rmSync(join(dir, 'dist/runtime-versions.json'));
    assert.match(checkDist(dir).join(), /runtime-versions\.json is missing/);
    assert.ok(checkDist(join(dir, 'nowhere')).length > 0);
  });
});

test('gate-stack.sh: syntax, port set, read-only subcommands, and refusals', async () => {
  const script = join(STACK, 'gate-stack.sh');
  assert.equal(sh(['bash', '-n', script]).status, 0);
  const ports = sh([script, 'ports']);
  assert.equal(ports.status, 0);
  assert.match(ports.stdout, /CHECKS_GATE_PORT_BACKEND=18080/);
  const live = sh([script, 'ports'], { CHECKS_GATE_PORT_BACKEND: '8080' });
  assert.equal(live.status, 1);
  assert.match(live.stderr, /live dev stack/);
  assert.match(sh([script, 'dist-sha']).stdout.trim(), /^[0-9a-f]{64}$/);
  const noStack = sh([script, 'status']);
  assert.notEqual(noStack.status, 0);
  assert.match(noStack.stderr, /CHECKS_GATE_STACK_DIR/);
  await withDirAsync(async (dir) => {
    const spk = sh([script, 'status'], { CHECKS_GATE_STACK_DIR: dir, CHECKS_GATE_GRADLE_DIR: '/somewhere/spk07-gradle' });
    assert.notEqual(spk.status, 0);
    assert.match(spk.stderr, /spk07-gradle/);
    const own = Object.fromEntries((await freePorts(6)).map((port, i) => [`CHECKS_GATE_PORT_${['BACKEND', 'CORE', 'RUNNER', 'CONNECTOR', 'VAULT', 'APP'][i]}`, String(port)]));
    const noGateway = sh([script, 'up'], { CHECKS_GATE_STACK_DIR: dir, ...own });
    assert.notEqual(noGateway.status, 0);
    assert.match(noGateway.stderr, /STUDIO_GATEWAY_PROJECT/);
  });
  const text = readScript(script);
  assert.ok(!/pnpm run build|npm run build|npm ci/.test(text.replace(/#.*$/gm, '')), 'the launcher must not build the runner dist');
  const guardOnly = text.replace(/#.*$/gm, '').split('\n').filter((l) => l.includes('spk07-gradle'));
  assert.equal(guardOnly.length, 1, 'spk07-gradle appears only in the guard that refuses it');
  assert.match(guardOnly[0] ?? '', /case .*spk07-gradle.*die/);
});

test('down never signals a process that is not the listener of a gate port', async () => {
  const bystander = await listen();
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  try {
    withDir((dir) => {
      const manifest = { runner: { pid: child.pid, port: 8090 }, backend: { pid: child.pid, port: bystander.port } };
      writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
      writeFileSync(join(dir, 'core.pid'), String(child.pid));
      writeFileSync(join(dir, 'issuer.pid'), String(child.pid));
      const down = sh([join(STACK, 'gate-stack.sh'), 'down'], { CHECKS_GATE_STACK_DIR: dir });
      assert.equal(down.status, 0, down.stderr);
      assert.match(down.stdout, /not signalling runner|manifest runner port 8090 is not this configuration/);
      assert.match(down.stdout, /manifest backend port \d+ is not this configuration|not signalling backend/);
      assert.match(down.stdout, /not signalling Core stand-in/);
    });
    assert.equal(child.exitCode, null, 'the bystander process is still alive');
    assert.doesNotThrow(() => process.kill(child.pid ?? 0, 0));
  } finally {
    child.kill('SIGKILL');
    await bystander.close();
  }
});

function readScript(path: string): string {
  return spawnSync('cat', [path], { encoding: 'utf8' }).stdout;
}

test('core declaration: the in-worktree package, package.json and dist only; accepted by the freeze; refused without dist', () => {
  withDir((dir) => {
    const pkg = join(dir, 'frontend', 'node_modules', '@put', 'core-components');
    assert.throws(() => coreDeclaration(dir), /package\.json and dist/);
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'package.json'), '{"name":"@put/core-components"}');
    assert.throws(() => coreDeclaration(dir), /package\.json and dist/, 'package.json alone is not enough');
    mkdirSync(join(pkg, 'dist'));
    writeFileSync(join(pkg, 'dist', 'index.js'), 'export {}');
    const declaration = coreDeclaration(dir);
    assert.deepEqual(declaration, { root: pkg, sourceScopes: ['package.json'], artifactRoot: pkg, artifactScopes: ['dist'] });
    const file = join(dir, 'core-declaration.json');
    writeFileSync(file, JSON.stringify(declaration));
    const before = process.env.CHECKS_GATE_EXTERNAL_CORE_DECLARATION;
    process.env.CHECKS_GATE_EXTERNAL_CORE_DECLARATION = file;
    try {
      const read = externalCoreDeclaration();
      assert.deepEqual(read, declaration);
      assert.ok(fileManifest(read!.root, read!.sourceScopes).digest.length > 0 && fileManifest(read!.artifactRoot, read!.artifactScopes).digest.length > 0);
    } finally {
      if (before === undefined) delete process.env.CHECKS_GATE_EXTERNAL_CORE_DECLARATION;
      else process.env.CHECKS_GATE_EXTERNAL_CORE_DECLARATION = before;
    }
  });
});
