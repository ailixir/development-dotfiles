#!/usr/bin/env node
/** Private, launch-scoped TLS for dev.sh's ordinary local runner. No guided/provider provisioning. */
import { createPrivateKey, createPublicKey, randomBytes, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED = ['STUDIO_RUNNER_TLS_KEY_FILE', 'STUDIO_RUNNER_TLS_CERT_FILE',
  'STUDIO_RUNNER_TLS_CA_FILE', 'STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256',
  'STUDIO_RUNNER_TLS_KEY_STORE', 'STUDIO_RUNNER_TLS_KEY_STORE_PASSWORD_FILE',
  'STUDIO_RUNNER_TLS_TRUST_STORE', 'STUDIO_RUNNER_TLS_TRUST_STORE_PASSWORD_FILE'];
const TYPES = ['STUDIO_RUNNER_TLS_KEY_STORE_TYPE', 'STUDIO_RUNNER_TLS_TRUST_STORE_TYPE'];
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const privateWrite = (path, value) => { writeFileSync(path, value, { mode: 0o600 }); chmodSync(path, 0o600); };
const fail = (message) => { throw new Error(message); };
function command(program, args, cwd) {
  try { return execFileSync(program, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { return fail(`Local TLS preparation failed in ${program === 'openssl' ? 'OpenSSL' : 'JDK keytool'}; verify installed tools and TLS files (tool output kept private).`); }
}
function readable(path, key, secret = false) {
  try {
    if (!lstatSync(path).isFile() || readFileSync(path).length === 0) throw new Error();
    if (secret && (lstatSync(path).mode & 0o077) !== 0) throw new Error();
  } catch { fail(`${key} must name a readable nonempty file${secret ? ' with no group/other permissions' : ''}.`); }
}
function certificate(path) {
  try { return new X509Certificate(readFileSync(path)); }
  catch { return fail('Local TLS certificate is invalid; configure valid PEM certificates.'); }
}
function keytool(env) {
  return env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', 'keytool') : 'keytool';
}

export function prepare(workDirectory, env = process.env) {
  process.umask(0o077);
  const dir = resolve(workDirectory);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) fail('Local TLS work directory must be a private directory, not a symlink.');
  chmodSync(dir, 0o700);
  const supplied = [...REQUIRED, ...TYPES].some((key) => (env[key] ?? '') !== '');
  const tls = {};
  if (supplied) {
    const missing = REQUIRED.filter((key) => !(env[key] ?? '').trim());
    if (missing.length) fail(`Partial local TLS configuration; set all required keys. Missing: ${missing.join(', ')}. Unset all TLS keys to generate ephemeral local TLS.`);
    for (const key of REQUIRED) tls[key] = env[key];
    for (const key of TYPES) {
      tls[key] = env[key] || 'PKCS12';
      if (!['PKCS12', 'JKS'].includes(tls[key].toUpperCase())) fail(`${key} must be PKCS12 or JKS.`);
    }
  } else {
    privateWrite(join(dir, 'ca.cnf'), '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=Checks ephemeral local CA\n[ext]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always\n');
    command('openssl', ['genrsa', '-out', 'ca.key', '2048'], dir);
    command('openssl', ['req', '-new', '-x509', '-sha256', '-key', 'ca.key', '-out', 'ca.crt', '-days', '2', '-config', 'ca.cnf'], dir);
    privateWrite(join(dir, 'leaf.ext'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth,clientAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n');
    for (const name of ['backend', 'runner']) {
      command('openssl', ['genrsa', '-out', `${name}.key`, '2048'], dir);
      command('openssl', ['req', '-new', '-key', `${name}.key`, '-out', `${name}.csr`, '-subj', '/CN=localhost'], dir);
      command('openssl', ['x509', '-req', '-sha256', '-in', `${name}.csr`, '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', `${name}.crt`, '-days', '2', '-extfile', 'leaf.ext'], dir);
    }
    privateWrite(join(dir, 'store.pass'), randomBytes(32).toString('base64url'));
    command('openssl', ['pkcs12', '-export', '-in', 'backend.crt', '-inkey', 'backend.key', '-certfile', 'ca.crt', '-out', 'backend.p12', '-passout', 'file:store.pass'], dir);
    command(keytool(env), ['-importcert', '-noprompt', '-alias', 'local-ca', '-file', 'ca.crt', '-keystore', 'trust.p12', '-storetype', 'PKCS12', '-storepass:file', 'store.pass'], dir);
    Object.assign(tls, {
      STUDIO_RUNNER_TLS_KEY_FILE: join(dir, 'runner.key'), STUDIO_RUNNER_TLS_CERT_FILE: join(dir, 'runner.crt'),
      STUDIO_RUNNER_TLS_CA_FILE: join(dir, 'ca.crt'),
      STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256: certificate(join(dir, 'backend.crt')).fingerprint256,
      STUDIO_RUNNER_TLS_KEY_STORE: join(dir, 'backend.p12'), STUDIO_RUNNER_TLS_KEY_STORE_PASSWORD_FILE: join(dir, 'store.pass'),
      STUDIO_RUNNER_TLS_TRUST_STORE: join(dir, 'trust.p12'), STUDIO_RUNNER_TLS_TRUST_STORE_PASSWORD_FILE: join(dir, 'store.pass'),
      STUDIO_RUNNER_TLS_KEY_STORE_TYPE: 'PKCS12', STUDIO_RUNNER_TLS_TRUST_STORE_TYPE: 'PKCS12',
    });
  }
  for (const key of REQUIRED.filter((key) => key !== 'STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256')) {
    tls[key] = resolve(tls[key]);
    readable(tls[key], key, /KEY_FILE|KEY_STORE$|TRUST_STORE$|PASSWORD_FILE/.test(key));
  }
  privateWrite(join(dir, 'health.pass'), randomBytes(32).toString('base64url'));
  command(keytool(env), ['-importkeystore', '-noprompt', '-srckeystore', tls.STUDIO_RUNNER_TLS_KEY_STORE,
    '-srcstoretype', tls.STUDIO_RUNNER_TLS_KEY_STORE_TYPE, '-srcstorepass:file', tls.STUDIO_RUNNER_TLS_KEY_STORE_PASSWORD_FILE,
    '-destkeystore', join(dir, 'health.p12'), '-deststoretype', 'PKCS12', '-deststorepass:file', join(dir, 'health.pass')], dir);
  command('openssl', ['pkcs12', '-in', 'health.p12', '-passin', 'file:health.pass', '-nokeys', '-out', 'health.crt'], dir);
  const backend = certificate(join(dir, 'health.crt')), runner = certificate(tls.STUDIO_RUNNER_TLS_CERT_FILE);
  if (backend.fingerprint256 !== tls.STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256) fail('STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256 does not match the backend key store certificate.');
  for (const leaf of [backend, runner]) {
    if (!leaf.checkHost('localhost', { subject: 'never' }) || !leaf.checkIP('127.0.0.1')) fail('Local TLS leaves require localhost and 127.0.0.1 SANs.');
    if (!['1.3.6.1.5.5.7.3.1', '1.3.6.1.5.5.7.3.2'].every((oid) => leaf.keyUsage?.includes(oid))) {
      fail('Local TLS leaves require both serverAuth and clientAuth extended key usages.');
    }
  }
  try {
    const publicKey = createPublicKey(createPrivateKey(readFileSync(tls.STUDIO_RUNNER_TLS_KEY_FILE))).export({ type: 'spki', format: 'der' });
    if (!publicKey.equals(runner.publicKey.export({ type: 'spki', format: 'der' }))) fail('Runner TLS key and certificate do not match.');
  } catch { fail('Runner TLS key and certificate must be a matching, unencrypted PEM pair.'); }
  const trust = command(keytool(env), ['-list', '-rfc', '-keystore', tls.STUDIO_RUNNER_TLS_TRUST_STORE,
    '-storetype', tls.STUDIO_RUNNER_TLS_TRUST_STORE_TYPE, '-storepass:file', tls.STUDIO_RUNNER_TLS_TRUST_STORE_PASSWORD_FILE], dir);
  privateWrite(join(dir, 'backend-trust.pem'), (trust.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? []).join('\n'));
  for (const [leaf, ca] of [[tls.STUDIO_RUNNER_TLS_CERT_FILE, join(dir, 'backend-trust.pem')], [join(dir, 'health.crt'), tls.STUDIO_RUNNER_TLS_CA_FILE]]) {
    for (const purpose of ['sslserver', 'sslclient']) command('openssl', ['verify', '-CAfile', ca, '-untrusted', leaf, '-purpose', purpose, '-verify_hostname', 'localhost', leaf], dir);
  }
  const runnerEnv = {
    PATH: env.PATH || '', HOME: env.HOME || '', TMPDIR: dir,
    ...(env.PLAYWRIGHT_BROWSERS_PATH ? { PLAYWRIGHT_BROWSERS_PATH: env.PLAYWRIGHT_BROWSERS_PATH } : {}),
    STUDIO_RUNNER_HOST: '127.0.0.1', STUDIO_RUNNER_PORT: env.DEV_STUDIO_RUNNER_PORT || '8090', STUDIO_RUNNER_POOL_SIZE: '1',
    STUDIO_RUNNER_SERVICE_IDENTITY: env.STUDIO_RUNNER_SERVICE_TOKEN || randomBytes(32).toString('base64url'),
    STUDIO_RUNNER_CALLBACK_IDENTITY: env.STUDIO_CALLBACK_SERVICE_TOKEN || randomBytes(32).toString('base64url'),
    STUDIO_RUNNER_CALLBACK_BASE_URL: `http://127.0.0.1:${env.DEV_BACKEND_PORT || '8080'}`,
    STUDIO_RUNNER_SCRATCH_DIR: join(dir, 'scratch'), STUDIO_RUNNER_OBJECT_STORE_PROVIDER: 'local', STUDIO_RUNNER_OBJECT_STORE_DIR: join(dir, 'objects'),
    ...Object.fromEntries(REQUIRED.slice(0, 4).map((key) => [key, tls[key]])),
  };
  privateWrite(join(dir, 'runner-environment.json'), JSON.stringify(runnerEnv));
  privateWrite(join(dir, 'tls-environment.sh'), Object.entries(tls).map(([key, value]) => `export ${key}=${shellQuote(value)}\n`).join(''));
  return { dir, tls, generated: !supplied };
}

export async function health(workDirectory) {
  const dir = resolve(workDirectory), env = JSON.parse(readFileSync(join(dir, 'runner-environment.json'), 'utf8'));
  return new Promise((resolveHealth) => {
    let settled = false;
    const finish = (ok) => { if (!settled) { settled = true; resolveHealth(ok); } };
    const req = request({ hostname: '127.0.0.1', port: Number(env.STUDIO_RUNNER_PORT), path: '/health', method: 'GET',
      ca: readFileSync(join(dir, 'backend-trust.pem')), pfx: readFileSync(join(dir, 'health.p12')),
      passphrase: readFileSync(join(dir, 'health.pass'), 'utf8'), rejectUnauthorized: true,
      headers: { authorization: `Bearer ${env.STUDIO_RUNNER_SERVICE_IDENTITY}` } }, (res) => {
      res.resume(); res.once('end', () => finish(res.statusCode === 200));
    });
    req.setTimeout(2000, () => { req.destroy(); finish(false); }); req.once('error', () => finish(false)); req.end();
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, dir] = process.argv.slice(2);
    if (!dir || !['prepare', 'health', 'run'].includes(mode)) fail('Usage: node tools/studio-local-tls.mjs prepare|health|run <private-work-directory>');
    if (mode === 'prepare') prepare(dir);
    else if (mode === 'health') process.exitCode = await health(dir) ? 0 : 1;
    else {
      const env = JSON.parse(readFileSync(join(resolve(dir), 'runner-environment.json'), 'utf8'));
      if (typeof process.execve !== 'function') fail('Local runner requires Node 24 with process.execve support.');
      process.execve(process.execPath, [process.execPath, 'dist/main.js'], env);
    }
  } catch (error) {
    // Only our fixed messages reach stderr; parser/tool exceptions may contain private file values.
    const message = error instanceof Error && /^(Local TLS|Partial local TLS|STUDIO_RUNNER_|Runner TLS|Usage:|Local runner)/.test(error.message)
      ? error.message : 'Local TLS preparation failed; verify the complete TLS configuration and installed OpenSSL/JDK tools.';
    process.stderr.write(`${message}\n`); process.exitCode = 1;
  }
}
