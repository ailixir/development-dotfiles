import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtempSync, openSync, closeSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:https';
import { createServer as createTcpServer } from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomBytes, X509Certificate } from 'node:crypto';
import { health, prepare } from '../studio-local-tls.mjs';

let root, generated, server;
const baseEnv = { PATH: process.env.PATH, HOME: process.env.HOME, JAVA_HOME: process.env.JAVA_HOME };
before(async () => {
  root = mkdtempSync(join(tmpdir(), 'checks-local-tls-test-'));
  generated = prepare(join(root, 'generated'), { ...baseEnv, DEV_STUDIO_RUNNER_PORT: '0',
    GOOGLE_APPLICATION_CREDENTIALS: 'must-not-reach-runner', STUDIO_RUNNER_UNKNOWN: 'must-not-reach-runner' });
  const config = JSON.parse(readFileSync(join(generated.dir, 'runner-environment.json'), 'utf8'));
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
  const backend = new X509Certificate(readFileSync(join(generated.dir, 'health.crt')));
  assert.equal(ca.ca, true);
  assert.notEqual(runner.fingerprint256, backend.fingerprint256);
  assert.equal(backend.fingerprint256, generated.tls.STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256);
  for (const cert of [runner, backend]) {
    assert.equal(cert.checkIP('127.0.0.1'), '127.0.0.1');
    assert.equal(cert.checkHost('localhost', { subject: 'never' }), 'localhost');
    assert.ok(cert.keyUsage.includes('1.3.6.1.5.5.7.3.1'));
    assert.ok(cert.keyUsage.includes('1.3.6.1.5.5.7.3.2'));
  }
  assert.equal(statSync(generated.dir).mode & 0o777, 0o700);
  for (const name of readdirSync(generated.dir)) assert.equal(statSync(join(generated.dir, name)).mode & 0o777, 0o600);
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

test('complete explicit TLS is honored; partial and mismatched input fail closed', () => {
  const explicit = prepare(join(root, 'explicit'), { ...baseEnv, ...generated.tls });
  assert.equal(explicit.generated, false);
  assert.equal(explicit.tls.STUDIO_RUNNER_TLS_KEY_FILE, generated.tls.STUDIO_RUNNER_TLS_KEY_FILE);
  assert.throws(() => prepare(join(root, 'partial'), { ...baseEnv, STUDIO_RUNNER_TLS_CA_FILE: generated.tls.STUDIO_RUNNER_TLS_CA_FILE }), /Partial local TLS configuration/);
  assert.throws(() => prepare(join(root, 'wrong-pin'), { ...baseEnv, ...generated.tls,
    STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256: '00:'.repeat(31) + '00' }), /does not match/);
});

test('runner environment is enumerated and shell output carries paths without credentials', () => {
  const config = JSON.parse(readFileSync(join(generated.dir, 'runner-environment.json'), 'utf8'));
  assert.equal(config.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  assert.equal(config.STUDIO_RUNNER_UNKNOWN, undefined);
  assert.equal(config.STUDIO_RUNNER_TLS_KEY_STORE, undefined);
  const shell = readFileSync(join(generated.dir, 'tls-environment.sh'), 'utf8');
  assert.equal(shell.includes(config.STUDIO_RUNNER_SERVICE_IDENTITY), false);
  assert.equal(shell.includes(readFileSync(join(generated.dir, 'store.pass'), 'utf8')), false);
  const sourced = execFileSync('bash', ['-c', 'source "$1"; printf "%s" "$STUDIO_RUNNER_TLS_KEY_FILE"', 'local-tls-test', join(generated.dir, 'tls-environment.sh')], { encoding: 'utf8' });
  assert.equal(sourced, generated.tls.STUDIO_RUNNER_TLS_KEY_FILE);
});

test('complete explicit JKS operator stores remain supported', () => {
  const tool = baseEnv.JAVA_HOME ? join(baseEnv.JAVA_HOME, 'bin', 'keytool') : 'keytool';
  const store = join(root, 'operator.jks');
  execFileSync(tool, ['-importkeystore', '-noprompt', '-srckeystore', generated.tls.STUDIO_RUNNER_TLS_KEY_STORE,
    '-srcstoretype', 'PKCS12', '-srcstorepass:file', generated.tls.STUDIO_RUNNER_TLS_KEY_STORE_PASSWORD_FILE,
    '-destkeystore', store, '-deststoretype', 'JKS', '-deststorepass:file', generated.tls.STUDIO_RUNNER_TLS_KEY_STORE_PASSWORD_FILE], { stdio: 'pipe' });
  const explicit = prepare(join(root, 'explicit-jks'), { ...baseEnv, ...generated.tls,
    STUDIO_RUNNER_TLS_KEY_STORE: store, STUDIO_RUNNER_TLS_KEY_STORE_TYPE: 'JKS' });
  assert.equal(explicit.generated, false);
  assert.equal(explicit.tls.STUDIO_RUNNER_TLS_KEY_STORE, store);
});

test('explicit independent issuers use backend trust for outbound mutual TLS health', async () => {
  const runnerIdentity = prepare(join(root, 'second-issuer'), baseEnv);
  const mixed = prepare(join(root, 'dual-issuer'), { ...baseEnv, ...generated.tls,
    STUDIO_RUNNER_TLS_KEY_FILE: runnerIdentity.tls.STUDIO_RUNNER_TLS_KEY_FILE,
    STUDIO_RUNNER_TLS_CERT_FILE: runnerIdentity.tls.STUDIO_RUNNER_TLS_CERT_FILE,
    STUDIO_RUNNER_TLS_TRUST_STORE: runnerIdentity.tls.STUDIO_RUNNER_TLS_TRUST_STORE,
    STUDIO_RUNNER_TLS_TRUST_STORE_PASSWORD_FILE: runnerIdentity.tls.STUDIO_RUNNER_TLS_TRUST_STORE_PASSWORD_FILE });
  assert.equal(mixed.generated, false);
  const config = JSON.parse(readFileSync(join(mixed.dir, 'runner-environment.json'), 'utf8'));
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
      new X509Certificate(readFileSync(join(mixed.dir, 'backend-trust.pem'))).fingerprint256);
    assert.equal(await health(mixed.dir), true);
  } finally { await new Promise((resolve) => listener.close(resolve)); }
});

test('explicit leaves missing either required extended usage are rejected before launch', () => {
  const dir = generated.dir;
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
    assert.throws(() => prepare(join(root, `${name}-missing-eku`), { ...baseEnv, ...tls }), /both serverAuth and clientAuth/);
  }
});

test('complete backend intermediate chain is preserved for explicit store validation', () => {
  const dir = generated.dir;
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
  const explicit = prepare(join(root, 'explicit-intermediate'), { ...baseEnv, ...generated.tls,
    STUDIO_RUNNER_TLS_KEY_STORE: join(dir, 'backend-chain.p12'),
    STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256: new X509Certificate(readFileSync(join(dir, 'backend-chain.crt'))).fingerprint256 });
  assert.equal(explicit.generated, false);
  assert.equal((readFileSync(join(explicit.dir, 'health.crt'), 'utf8').match(/BEGIN CERTIFICATE/g) ?? []).length, 3);
});

test('launcher execs the real TLS-only runner and drains only its owned child', async () => {
  const reservation = createTcpServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const own = prepare(join(root, 'production-entrypoint'), { ...baseEnv, DEV_STUDIO_RUNNER_PORT: String(port) });
  const log = openSync(join(own.dir, 'runner.log'), 'w', 0o600);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../studio-local-tls.mjs', import.meta.url)), 'run', own.dir], {
    cwd: fileURLToPath(new URL('../../studio-runner', import.meta.url)),
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

test('the generated runner environment carries the local navigation whitelist', () => {
  const config = JSON.parse(readFileSync(join(generated.dir, 'runner-environment.json'), 'utf8'));
  assert.equal(config.STUDIO_RUNNER_ALLOWED_DOMAINS, 'localhost,example.com,practicetestautomation.com');
});

test('the allow-all option is left to its default (on) locally unless STUDIO_ALLOW_ALL_DOMAINS is set, and then reaches the runner verbatim', () => {
  const unset = JSON.parse(readFileSync(join(generated.dir, 'runner-environment.json'), 'utf8'));
  assert.equal('STUDIO_RUNNER_ALLOW_ALL_DOMAINS' in unset, false);
  for (const value of ['true', 'false']) {
    const set = prepare(join(root, `allow-all-${value}`), { ...baseEnv, ...generated.tls, STUDIO_ALLOW_ALL_DOMAINS: value });
    assert.equal(JSON.parse(readFileSync(join(set.dir, 'runner-environment.json'), 'utf8')).STUDIO_RUNNER_ALLOW_ALL_DOMAINS, value);
  }
});
