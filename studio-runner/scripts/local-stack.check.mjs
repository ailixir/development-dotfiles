// Checks for local-stack.mjs / local-tokens.mjs and the process helpers of dev.mjs. Run with
// `node --test scripts/local-stack.check.mjs` (needs openssl, a JDK keytool and the built runner). Not named *.test.* on purpose:
// the vitest unit tier must not pick it up. POSIX mode bits do not exist on Windows (Node reports 0o666; the profile ACL
// stands in), so the mode assertions run on POSIX only.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { after, before, test } from 'node:test';
import { mkdtempSync, openSync, closeSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:https';
import { createServer as createTcpServer } from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createPublicKey, randomBytes, verify, X509Certificate } from 'node:crypto';
import { envGet, findOpenssl, health, init, parseEnvFile, windowsEnv } from './local-stack.mjs';
import { freePort, isAlive, portBusy, readPidFile, stopProcess, writePidFile } from './dev.mjs';

const POSIX = process.platform !== 'win32';

const runnerRoot = fileURLToPath(new URL('..', import.meta.url));
const script = (name) => fileURLToPath(new URL(name, import.meta.url));
let root, generated, server;
const baseEnv = { PATH: process.env.PATH, HOME: process.env.HOME, JAVA_HOME: process.env.JAVA_HOME };
const tlsFile = (result, name) => join(result.dir, 'tls', name);
const runnerEnvironment = (result) => JSON.parse(readFileSync(join(result.dir, 'runner-environment.json'), 'utf8'));
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? [join(dir, entry.name), ...walk(join(dir, entry.name))] : [join(dir, entry.name)]));

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'checks-local-stack-test-'));
  generated = init(join(root, 'generated'), { ...baseEnv, PUT_CHECKS_RUNNER_PORT: '0',
    GOOGLE_APPLICATION_CREDENTIALS: 'must-not-reach-runner', STUDIO_RUNNER_UNKNOWN: 'must-not-reach-runner' });
  const config = runnerEnvironment(generated);
  server = createServer({ key: readFileSync(generated.tls.STUDIO_RUNNER_TLS_KEY_FILE),
    cert: readFileSync(generated.tls.STUDIO_RUNNER_TLS_CERT_FILE), ca: readFileSync(generated.tls.STUDIO_RUNNER_TLS_CA_FILE),
    requestCert: true, rejectUnauthorized: true }, (req, res) => {
    res.writeHead(req.headers.authorization === `Bearer ${config.STUDIO_RUNNER_SERVICE_IDENTITY}` ? 200 : 401);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  config.STUDIO_RUNNER_PORT = String(server.address().port);
  writeFileSync(join(generated.dir, 'runner-environment.json'), JSON.stringify(config), { mode: 0o600 });
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (root) rmSync(root, { recursive: true, force: true });
});

test('generated material has separate loopback identities, proper CA usage and private modes', () => {
  const ca = new X509Certificate(readFileSync(generated.tls.STUDIO_RUNNER_TLS_CA_FILE));
  const runner = new X509Certificate(readFileSync(generated.tls.STUDIO_RUNNER_TLS_CERT_FILE));
  const backend = new X509Certificate(readFileSync(tlsFile(generated, 'health.crt')));
  assert.equal(ca.ca, true);
  assert.notEqual(runner.fingerprint256, backend.fingerprint256);
  assert.equal(backend.fingerprint256, generated.tls.STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256);
  for (const cert of [runner, backend]) {
    assert.equal(cert.checkIP('127.0.0.1'), '127.0.0.1');
    assert.equal(cert.checkHost('localhost', { subject: 'never' }), 'localhost');
    assert.ok(cert.keyUsage.includes('1.3.6.1.5.5.7.3.1'));
    assert.ok(cert.keyUsage.includes('1.3.6.1.5.5.7.3.2'));
    const days = (Date.parse(cert.validTo) - Date.now()) / 86_400_000;
    assert.ok(days > 29 && days <= 30, `leaf validity is 30 days, got ${days}`);
  }
  if (POSIX) {
    assert.equal(statSync(generated.dir).mode & 0o777, 0o700);
    for (const path of walk(generated.dir)) assert.equal(statSync(path).mode & 0o777, statSync(path).isDirectory() ? 0o700 : 0o600, path);
  }
});

test('the shared layout is complete', () => {
  const names = readdirSync(generated.dir).sort();
  for (const name of ['tls', 'identity', 'issuer', 'tokens', 'journal', 'objects', 'scratch', 'logs',
    'catalog.json', 'backend-overlay.yml', 'backend.env', 'runner-environment.json']) assert.ok(names.includes(name), name);
  for (const name of ['service.token', 'callback.token']) assert.ok(readFileSync(join(generated.dir, 'identity', name), 'utf8').length > 20);
  for (const name of ['issuer.private.pem', 'issuer.public.pem']) assert.ok(statSync(join(generated.dir, 'issuer', name)).size > 0);
});

test('strict real mutual TLS health succeeds and wrong bearer is refused', async () => {
  assert.equal(await health(generated.dir), true);
  const file = join(generated.dir, 'runner-environment.json');
  const original = readFileSync(file, 'utf8'), config = JSON.parse(original);
  config.STUDIO_RUNNER_SERVICE_IDENTITY = randomBytes(32).toString('hex');
  writeFileSync(file, JSON.stringify(config));
  try { assert.equal(await health(generated.dir), false); }
  finally { writeFileSync(file, original); }
});

test('server rejects a health request without its client certificate', async () => {
  const status = await new Promise((resolve) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path: '/health',
      ca: readFileSync(generated.tls.STUDIO_RUNNER_TLS_CA_FILE) }, (res) => { res.resume(); resolve(res.statusCode); });
    req.once('error', () => resolve('transport-refused')); req.end();
  });
  assert.equal(status, 'transport-refused');
});

test('a second init keeps the same identity: certificates, tokens, issuer keys and catalog', () => {
  const dir = join(root, 'idempotent');
  const env = { ...baseEnv, PUT_CHECKS_RUNNER_PORT: '18090', PUT_CHECKS_BACKEND_PORT: '18080', PUT_CHECKS_GUIDED_PORT: '18092' };
  const first = init(dir, env);
  const files = ['identity/service.token', 'identity/callback.token', 'issuer/issuer.private.pem', 'issuer/issuer.public.pem',
    'tls/ca.crt', 'tls/runner.crt', 'tls/backend.crt', 'tls/backend.p12', 'tls/trust.p12', 'tls/store.pass', 'catalog.json', 'backend.env'];
  const kept = Object.fromEntries(files.map((name) => [name, readFileSync(join(dir, name), 'utf8')]));
  const fingerprint = new X509Certificate(kept['tls/runner.crt']).fingerprint256;
  const second = init(dir, env);
  for (const name of files) assert.equal(readFileSync(join(dir, name), 'utf8'), kept[name], name);
  assert.equal(new X509Certificate(readFileSync(join(dir, 'tls', 'runner.crt'))).fingerprint256, fingerprint);
  assert.equal(second.tls.STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256, first.tls.STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256);
  assert.equal(second.catalogChanged, false);
  assert.equal(second.tlsRegenerated, false);
  // Unusable generated material is replaced (and the caller is told the backend has to restart).
  rmSync(join(dir, 'tls', 'trust.p12'));
  const third = init(dir, env);
  assert.equal(third.tlsRegenerated, true);
  assert.notEqual(new X509Certificate(readFileSync(join(dir, 'tls', 'runner.crt'))).fingerprint256, fingerprint);
  // A catalog change is reported once.
  writeFileSync(join(dir, 'catalog.json'), '{"stale":true}\n');
  assert.equal(init(dir, env).catalogChanged, true);
  assert.equal(init(dir, env).catalogChanged, false);
});

test('the default directory is PUT_CHECKS_LOCAL_DIR', () => {
  const dir = join(root, 'from-env');
  assert.equal(init(undefined, { ...baseEnv, PUT_CHECKS_LOCAL_DIR: dir }).dir, dir);
  assert.ok(statSync(join(dir, 'backend.env')).isFile());
});

test('ports follow the PUT_CHECKS_* names and a bad port fails closed', () => {
  const ported = init(join(root, 'ported'), { ...baseEnv, PUT_CHECKS_RUNNER_PORT: '18090', PUT_CHECKS_BACKEND_PORT: '18080', PUT_CHECKS_GUIDED_PORT: '18092' });
  const config = runnerEnvironment(ported);
  assert.equal(config.STUDIO_RUNNER_PORT, '18090');
  assert.equal(config.STUDIO_RUNNER_CALLBACK_BASE_URL, 'http://127.0.0.1:18080');
  assert.equal(config.STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL, 'https://127.0.0.1:18092');
  const overlay = readFileSync(join(ported.dir, 'backend-overlay.yml'), 'utf8');
  assert.match(overlay, /runner-origin: "https:\/\/127\.0\.0\.1:18090"/);
  assert.match(overlay, /connector:\n {6}port: 18092/);
  assert.match(overlay, /controller-origin: "https:\/\/127\.0\.0\.1:18092"/);
  assert.throws(() => init(join(root, 'bad-port'), { ...baseEnv, PUT_CHECKS_RUNNER_PORT: 'eighty' }), /PUT_CHECKS_RUNNER_PORT must be a port number/);
});

test('complete explicit TLS is honored; partial and mismatched input fail closed', () => {
  const explicit = init(join(root, 'explicit'), { ...baseEnv, ...generated.tls });
  assert.equal(explicit.generated, false);
  assert.equal(explicit.tls.STUDIO_RUNNER_TLS_KEY_FILE, generated.tls.STUDIO_RUNNER_TLS_KEY_FILE);
  assert.throws(() => init(join(root, 'partial'), { ...baseEnv, STUDIO_RUNNER_TLS_CA_FILE: generated.tls.STUDIO_RUNNER_TLS_CA_FILE }), /Partial local TLS configuration/);
  assert.throws(() => init(join(root, 'wrong-pin'), { ...baseEnv, ...generated.tls,
    STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256: '00:'.repeat(31) + '00' }), /does not match/);
});

test('runner environment is enumerated and backend.env carries exactly the backend side', () => {
  const config = runnerEnvironment(generated);
  assert.equal(config.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  assert.equal(config.STUDIO_RUNNER_UNKNOWN, undefined);
  assert.equal(config.STUDIO_RUNNER_TLS_KEY_STORE, undefined);
  const file = join(generated.dir, 'backend.env');
  const text = readFileSync(file, 'utf8');
  assert.equal(text.includes(readFileSync(tlsFile(generated, 'store.pass'), 'utf8')), false, 'passwords stay in files');
  // Plain dotenv: KEY=value, no export, no quoting; backend/scripts/dev.mjs reads it verbatim.
  const lines = text.split('\n').filter(Boolean);
  for (const line of lines) assert.match(line, /^[A-Z0-9_]+=[^'"\s]/, line.split('=')[0]);
  assert.deepEqual(lines.map((line) => line.split('=')[0]), ['STUDIO_RUNNER_BASE_URL', 'STUDIO_RUNNER_SERVICE_TOKEN', 'STUDIO_CALLBACK_SERVICE_TOKEN',
    'STUDIO_RUNNER_TLS_KEY_STORE', 'STUDIO_RUNNER_TLS_KEY_STORE_PASSWORD_FILE', 'STUDIO_RUNNER_TLS_KEY_STORE_TYPE',
    'STUDIO_RUNNER_TLS_TRUST_STORE', 'STUDIO_RUNNER_TLS_TRUST_STORE_PASSWORD_FILE', 'STUDIO_RUNNER_TLS_TRUST_STORE_TYPE',
    'STUDIO_EVIDENCE_PROVIDER', 'STUDIO_EVIDENCE_DIRECTORY', 'SPRING_CONFIG_ADDITIONAL_LOCATION']);
  const values = parseEnvFile(text);
  assert.equal(values.STUDIO_RUNNER_SERVICE_TOKEN, config.STUDIO_RUNNER_SERVICE_IDENTITY);
  assert.equal(values.STUDIO_CALLBACK_SERVICE_TOKEN, config.STUDIO_RUNNER_CALLBACK_IDENTITY);
  assert.equal(values.STUDIO_RUNNER_TLS_KEY_STORE, generated.tls.STUDIO_RUNNER_TLS_KEY_STORE);
  assert.equal(values.STUDIO_EVIDENCE_DIRECTORY, config.STUDIO_RUNNER_OBJECT_STORE_DIR);
  assert.equal(values.SPRING_CONFIG_ADDITIONAL_LOCATION, pathToFileURL(join(generated.dir, 'backend-overlay.yml')).href);
  assert.match(values.SPRING_CONFIG_ADDITIONAL_LOCATION, /^file:\/\/\//);
});

test('complete explicit JKS operator stores remain supported', () => {
  const tool = baseEnv.JAVA_HOME ? join(baseEnv.JAVA_HOME, 'bin', 'keytool') : 'keytool';
  const store = join(root, 'operator.jks');
  execFileSync(tool, ['-importkeystore', '-noprompt', '-srckeystore', generated.tls.STUDIO_RUNNER_TLS_KEY_STORE,
    '-srcstoretype', 'PKCS12', '-srcstorepass:file', generated.tls.STUDIO_RUNNER_TLS_KEY_STORE_PASSWORD_FILE,
    '-destkeystore', store, '-deststoretype', 'JKS', '-deststorepass:file', generated.tls.STUDIO_RUNNER_TLS_KEY_STORE_PASSWORD_FILE], { stdio: 'pipe' });
  const explicit = init(join(root, 'explicit-jks'), { ...baseEnv, ...generated.tls,
    STUDIO_RUNNER_TLS_KEY_STORE: store, STUDIO_RUNNER_TLS_KEY_STORE_TYPE: 'JKS' });
  assert.equal(explicit.generated, false);
  assert.equal(explicit.tls.STUDIO_RUNNER_TLS_KEY_STORE, store);
});

test('explicit independent issuers use backend trust for outbound mutual TLS health', async () => {
  const runnerIdentity = init(join(root, 'second-issuer'), baseEnv);
  const mixed = init(join(root, 'dual-issuer'), { ...baseEnv, ...generated.tls,
    STUDIO_RUNNER_TLS_KEY_FILE: runnerIdentity.tls.STUDIO_RUNNER_TLS_KEY_FILE,
    STUDIO_RUNNER_TLS_CERT_FILE: runnerIdentity.tls.STUDIO_RUNNER_TLS_CERT_FILE,
    STUDIO_RUNNER_TLS_TRUST_STORE: runnerIdentity.tls.STUDIO_RUNNER_TLS_TRUST_STORE,
    STUDIO_RUNNER_TLS_TRUST_STORE_PASSWORD_FILE: runnerIdentity.tls.STUDIO_RUNNER_TLS_TRUST_STORE_PASSWORD_FILE });
  assert.equal(mixed.generated, false);
  const config = runnerEnvironment(mixed);
  const listener = createServer({ key: readFileSync(mixed.tls.STUDIO_RUNNER_TLS_KEY_FILE),
    cert: readFileSync(mixed.tls.STUDIO_RUNNER_TLS_CERT_FILE), ca: readFileSync(generated.tls.STUDIO_RUNNER_TLS_CA_FILE),
    requestCert: true, rejectUnauthorized: true }, (req, res) => {
    res.writeHead(req.headers.authorization === `Bearer ${config.STUDIO_RUNNER_SERVICE_IDENTITY}` ? 200 : 401); res.end();
  });
  await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  try {
    config.STUDIO_RUNNER_PORT = String(listener.address().port);
    writeFileSync(join(mixed.dir, 'runner-environment.json'), JSON.stringify(config));
    assert.notEqual(new X509Certificate(readFileSync(mixed.tls.STUDIO_RUNNER_TLS_CA_FILE)).fingerprint256,
      new X509Certificate(readFileSync(tlsFile(mixed, 'backend-trust.pem'))).fingerprint256);
    assert.equal(await health(mixed.dir), true);
  } finally { await new Promise((resolve) => listener.close(resolve)); }
});

test('explicit leaves missing either required extended usage are rejected before launch', () => {
  const dir = join(generated.dir, 'tls');
  const ext = join(dir, 'no-eku.ext');
  writeFileSync(ext, 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n', { mode: 0o600 });
  for (const name of ['runner', 'backend']) {
    const cert = join(dir, `${name}-no-eku.crt`);
    execFileSync('openssl', ['x509', '-req', '-sha256', '-in', join(dir, `${name}.csr`),
      '-CA', join(dir, 'ca.crt'), '-CAkey', join(dir, 'ca.key'), '-CAcreateserial', '-out', cert,
      '-days', '2', '-extfile', ext], { stdio: 'pipe' });
    const tls = { ...generated.tls };
    if (name === 'runner') tls.STUDIO_RUNNER_TLS_CERT_FILE = cert;
    else {
      const store = join(dir, 'backend-no-eku.p12');
      execFileSync('openssl', ['pkcs12', '-export', '-in', cert, '-inkey', join(dir, 'backend.key'),
        '-certfile', join(dir, 'ca.crt'), '-out', store, '-passout', `file:${join(dir, 'store.pass')}`], { stdio: 'pipe' });
      tls.STUDIO_RUNNER_TLS_KEY_STORE = store;
      tls.STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256 = new X509Certificate(readFileSync(cert)).fingerprint256;
    }
    assert.throws(() => init(join(root, `${name}-missing-eku`), { ...baseEnv, ...tls }), /both serverAuth and clientAuth/);
  }
});

test('complete backend intermediate chain is preserved for explicit store validation', () => {
  const dir = join(generated.dir, 'tls');
  const run = (args) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'intermediate.ext'), 'basicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n', { mode: 0o600 });
  run(['genrsa', '-out', 'intermediate.key', '2048']);
  run(['req', '-new', '-key', 'intermediate.key', '-out', 'intermediate.csr', '-subj', '/CN=Local test intermediate']);
  run(['x509', '-req', '-sha256', '-in', 'intermediate.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key',
    '-CAcreateserial', '-out', 'intermediate.crt', '-days', '2', '-extfile', 'intermediate.ext']);
  run(['x509', '-req', '-sha256', '-in', 'backend.csr', '-CA', 'intermediate.crt', '-CAkey', 'intermediate.key',
    '-CAcreateserial', '-out', 'backend-chain.crt', '-days', '2', '-extfile', 'leaf.ext']);
  writeFileSync(join(dir, 'intermediate-chain.pem'), readFileSync(join(dir, 'intermediate.crt'), 'utf8') + readFileSync(join(dir, 'ca.crt'), 'utf8'), { mode: 0o600 });
  run(['pkcs12', '-export', '-in', 'backend-chain.crt', '-inkey', 'backend.key', '-certfile',
    'intermediate-chain.pem', '-out', 'backend-chain.p12', '-passout', 'file:store.pass']);
  const explicit = init(join(root, 'explicit-intermediate'), { ...baseEnv, ...generated.tls,
    STUDIO_RUNNER_TLS_KEY_STORE: join(dir, 'backend-chain.p12'),
    STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256: new X509Certificate(readFileSync(join(dir, 'backend-chain.crt'))).fingerprint256 });
  assert.equal(explicit.generated, false);
  assert.equal((readFileSync(tlsFile(explicit, 'health.crt'), 'utf8').match(/BEGIN CERTIFICATE/g) ?? []).length, 3);
});

// A SIGTERM sent from Node on Windows is a hard kill (there is no drain to observe), so this one is POSIX-only.
test('run mode starts the real TLS-only runner and drains only its owned child', { skip: !POSIX && 'no programmatic graceful signal on Windows' }, async () => {
  const reservation = createTcpServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const own = init(join(root, 'production-entrypoint'), { ...baseEnv, PUT_CHECKS_RUNNER_PORT: String(port) });
  execFileSync(process.execPath, [script('local-tokens.mjs'), 'once'], { env: { ...baseEnv, PUT_CHECKS_LOCAL_DIR: own.dir }, stdio: 'pipe' });
  const log = openSync(join(own.dir, 'logs', 'runner.log'), 'w', 0o600);
  const child = spawn(process.execPath, [script('local-stack.mjs'), 'run', own.dir], {
    cwd: runnerRoot,
    env: Object.fromEntries(Object.entries(baseEnv).filter(([, value]) => value !== undefined)),
    stdio: ['ignore', log, log],
  });
  closeSync(log);
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  try {
    let ready = false;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline && child.exitCode === null) {
      if (await health(own.dir)) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(ready, true, 'real production entry point must serve strict mutual TLS health');
    child.kill('SIGTERM');
    const result = await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve('timeout'), 5000).unref())]);
    assert.notEqual(result, 'timeout', 'owned runner must complete its ordinary drain');
    assert.equal(result.code, 0);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await exited;
  }
});

test('the runner environment carries the guided and observed-replay keys', () => {
  const config = runnerEnvironment(generated);
  const catalog = JSON.parse(readFileSync(join(generated.dir, 'catalog.json'), 'utf8'));
  assert.equal(config.STUDIO_RUNNER_GUIDED_ENABLED, 'true');
  assert.equal(config.STUDIO_RUNNER_GUIDED_CAPACITY, '1');
  assert.equal(config.STUDIO_RUNNER_GUIDED_JOURNAL_DIR, join(generated.dir, 'journal'));
  assert.equal(config.STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE, join(generated.dir, 'issuer', 'issuer.public.pem'));
  assert.equal(config.STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE, join(generated.dir, 'tokens', 'worker-callback.jwt'));
  assert.equal(config.STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED, 'true');
  assert.equal(config.STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED, 'true');
  assert.equal(config.STUDIO_RUNNER_OBSERVED_CATALOG_FILE, join(generated.dir, 'catalog.json'));
  assert.equal(config.STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST, catalog.build.executableImageDigest);
  assert.equal(config.STUDIO_RUNNER_RECORDING_WIDTH, '1280');
  assert.equal(config.STUDIO_RUNNER_RECORDING_HEIGHT, '720');
});

test('the token issuer mints three verifiable 240 s tokens from the shared directory', () => {
  execFileSync(process.execPath, [script('local-tokens.mjs'), 'once'], { env: { ...baseEnv, PUT_CHECKS_LOCAL_DIR: generated.dir }, stdio: 'pipe' });
  const publicKey = createPublicKey(readFileSync(join(generated.dir, 'issuer', 'issuer.public.pem')));
  for (const [file, aud, role] of [['runner-controller.jwt', 'studio-guided-runner', 'backend-controller'],
    ['translation-controller.jwt', 'studio-guided-controller', 'backend-controller'], ['worker-callback.jwt', 'studio-guided-controller', 'owning-worker']]) {
    const token = readFileSync(join(generated.dir, 'tokens', file), 'utf8');
    if (POSIX) assert.equal(statSync(join(generated.dir, 'tokens', file)).mode & 0o777, 0o600);
    const [header, claims, signature] = token.split('.');
    assert.equal(verify('RSA-SHA256', Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, 'base64url')), true);
    const body = JSON.parse(Buffer.from(claims, 'base64url').toString());
    assert.deepEqual([body.iss, body.aud, body.role, body.exp - body.iat], ['local-ux-issuer', aud, role, 240]);
  }
});

test('the generated runner environment carries the local navigation whitelist', () => {
  assert.equal(runnerEnvironment(generated).STUDIO_RUNNER_ALLOWED_DOMAINS, 'localhost,example.com,practicetestautomation.com');
});

test('the allow-all option is left to its default (on) locally unless STUDIO_ALLOW_ALL_DOMAINS is set, and then reaches the runner verbatim', () => {
  assert.equal('STUDIO_RUNNER_ALLOW_ALL_DOMAINS' in runnerEnvironment(generated), false);
  for (const value of ['true', 'false']) {
    const set = init(join(root, `allow-all-${value}`), { ...baseEnv, ...generated.tls, STUDIO_ALLOW_ALL_DOMAINS: value });
    assert.equal(runnerEnvironment(set).STUDIO_RUNNER_ALLOW_ALL_DOMAINS, value);
  }
});

test('dotenv reading: comments, export prefix, quotes taken literally, inline comments, Windows paths kept', () => {
  assert.deepEqual(parseEnvFile('# note\nexport A=1\nB="two words"\nC=\'$HOME\'\nD=plain # comment\n\nE=C:\\Users\\x\\tls\\b.p12\r\nnot a line\nF=\n'),
    { A: '1', B: 'two words', C: '$HOME', D: 'plain', E: 'C:\\Users\\x\\tls\\b.p12', F: '' });
});

test('Windows runner environment: system keys from any spelling, TEMP and TMP on the private tmp/', () => {
  const env = { SYSTEMROOT: 'C:\\Windows', windir: 'C:\\Windows', USERPROFILE: 'C:\\Users\\dev', LOCALAPPDATA: 'L', APPDATA: 'A', COMSPEC: 'cmd', Path: 'P' };
  assert.deepEqual(windowsEnv(env, '/local', 'win32'), { SystemRoot: 'C:\\Windows', windir: 'C:\\Windows', USERPROFILE: 'C:\\Users\\dev',
    LOCALAPPDATA: 'L', APPDATA: 'A', ComSpec: 'cmd', TEMP: join('/local', 'tmp'), TMP: join('/local', 'tmp') });
  assert.deepEqual(windowsEnv(env, '/local', 'linux'), {});
  assert.equal(envGet(env, 'PATH', 'win32'), 'P');
  assert.equal(envGet(env, 'PATH', 'linux'), undefined);
  if (POSIX) assert.equal('SystemRoot' in runnerEnvironment(generated), false);
});

test('openssl lookup: PATH first, then Git for Windows, else a clear error', () => {
  assert.ok(findOpenssl({ PATH: process.env.PATH }).endsWith(POSIX ? 'openssl' : 'openssl.exe'));
  const git = (root) => join(root, 'Git', 'mingw64', 'bin', 'openssl.exe');
  assert.equal(findOpenssl({ PATH: '', ProgramFiles: 'C:/PF' }, 'win32', (path) => path === git('C:/PF')), git('C:/PF'));
  const user = join('C:/U/AppData/Local', 'Programs', 'Git', 'usr', 'bin', 'openssl.exe');
  assert.equal(findOpenssl({ PATH: '', LOCALAPPDATA: 'C:/U/AppData/Local' }, 'win32', (path) => path === user), user);
  assert.throws(() => findOpenssl({ PATH: '' }, 'win32', () => false), /Git for Windows/);
  assert.throws(() => findOpenssl({ PATH: '' }, 'linux'), /needs openssl on PATH/);
});

test('launcher process helpers: bind test, PID files, a leftover is stopped and a stranger is reported', async () => {
  const dir = join(root, 'pids-check');
  const holder = createTcpServer();
  await new Promise((resolve) => holder.listen(0, '127.0.0.1', resolve));
  const port = holder.address().port;
  try {
    assert.equal(await portBusy(port), true);
    assert.match(await freePort({ dir, name: 'x', port, checkout: runnerRoot, label: 'x', hint: 'pick another.' }), /did not start/);
    writePidFile(dir, 'x', { pid: process.pid, port, checkout: '/elsewhere', group: false });
    assert.deepEqual(readPidFile(dir, 'x'), { pid: process.pid, port, checkout: '/elsewhere', group: false });
    if (POSIX) assert.equal(statSync(join(dir, 'pids', 'x.json')).mode & 0o777, 0o600);
    assert.match(await freePort({ dir, name: 'x', port, checkout: runnerRoot, label: 'x', hint: 'pick another.' }), /not from/);
  } finally { await new Promise((resolve) => holder.close(resolve)); }
  assert.equal(await portBusy(port), false);
  // A recorded PID with a free port is a stale file, never a reason to signal anything.
  assert.equal(await freePort({ dir, name: 'x', port, checkout: runnerRoot, label: 'x', hint: '' }), null);
  // A leftover of this checkout that still holds its port is stopped.
  const child = spawn(process.execPath, ['-e', `require('net').createServer().listen(${port}, '127.0.0.1')`], { stdio: 'ignore' });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  try {
    for (let i = 0; i < 40 && !(await portBusy(port)); i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    writePidFile(dir, 'x', { pid: child.pid, port, checkout: runnerRoot, group: false });
    assert.equal(await freePort({ dir, name: 'x', port, checkout: runnerRoot, label: 'x', hint: '', graceMs: 5000 }), null);
    await exited;
    assert.equal(isAlive(child.pid), false);
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
  await stopProcess(child.pid); // already gone: a no-op
});
