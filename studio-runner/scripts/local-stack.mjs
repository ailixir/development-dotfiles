#!/usr/bin/env node
/**
 * Local stack material for scripts/dev.mjs (no Docker): private TLS, the two service identities, the guided
 * token issuer's keys, the observed catalog, and the files the backend reads. Everything lives in ONE directory
 * outside the repository (PUT_CHECKS_LOCAL_DIR, default ~/.put-checks/local) and survives restarts, so the runner and
 * the backend can each restart alone.
 *
 *   node scripts/local-stack.mjs init   [<dir>]   idempotent: reuse what is valid, write the files below
 *   node scripts/local-stack.mjs health [<dir>]   strict mutual-TLS GET /health; exit 0 when healthy
 *   node scripts/local-stack.mjs run    [<dir>]   run the runner in the foreground (cwd must hold dist/main.js)
 *
 * Layout: tls/ identity/ issuer/ tokens/ journal/ objects/ scratch/ tmp/ logs/, catalog.json, backend-overlay.yml,
 * backend.env (dotenv KEY=value lines that backend/scripts/dev.mjs reads), runner-environment.json (the runner's whole
 * environment). The launchers keep their PID files in pids/.
 *
 * File modes: on POSIX every directory is 0700 and every file 0600, and supplied secret files must have no group/other
 * bits. Windows has no mode bits (Node reports 0o666); there the per-user profile ACL of %USERPROFILE% covers the
 * default directory, so the mode checks run on POSIX only.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, X509Certificate } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { constants, homedir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REQUIRED = ['STUDIO_RUNNER_TLS_KEY_FILE', 'STUDIO_RUNNER_TLS_CERT_FILE',
  'STUDIO_RUNNER_TLS_CA_FILE', 'STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256',
  'STUDIO_RUNNER_TLS_KEY_STORE', 'STUDIO_RUNNER_TLS_KEY_STORE_PASSWORD_FILE',
  'STUDIO_RUNNER_TLS_TRUST_STORE', 'STUDIO_RUNNER_TLS_TRUST_STORE_PASSWORD_FILE'];
const TYPES = ['STUDIO_RUNNER_TLS_KEY_STORE_TYPE', 'STUDIO_RUNNER_TLS_TRUST_STORE_TYPE'];
// What the backend reads from its own environment (application.yml studio.runner.tls).
const BACKEND_TLS = ['STUDIO_RUNNER_TLS_KEY_STORE', 'STUDIO_RUNNER_TLS_KEY_STORE_PASSWORD_FILE', 'STUDIO_RUNNER_TLS_KEY_STORE_TYPE',
  'STUDIO_RUNNER_TLS_TRUST_STORE', 'STUDIO_RUNNER_TLS_TRUST_STORE_PASSWORD_FILE', 'STUDIO_RUNNER_TLS_TRUST_STORE_TYPE'];
const CERT_DAYS = 30;
const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;
// Any 64-hex value: it is pinned in the catalog and in the runner environment alike, and means nothing locally.
const IMAGE_DIGEST = '549e74b321c4dbba636ec0e5c6cf91bd49af5979af016f299285f9de9bd8aadb';
// The local navigation whitelist; the backend's application-local.yml carries the same list.
const DOMAINS = 'localhost,example.com,practicetestautomation.com';
// Names the guided hops agree on (local-tokens.mjs mints with the same three).
const ISSUER = 'local-ux-issuer', CONTROLLER = 'local-ux-controller', WORKER = 'local-ux-worker';
const RUNNER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const fail = (message) => { throw new Error(message); };
const POSIX = process.platform !== 'win32';
/** Writes through a temp file so a reader (the backend reading backend.env) never sees a half-written file. */
const privateWrite = (path, value) => {
  const temp = `${path}.tmp`;
  writeFileSync(temp, value, { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, path);
};
export const defaultDir = (env = process.env) => env.PUT_CHECKS_LOCAL_DIR || join(env.HOME || homedir(), '.put-checks', 'local');

/** Windows environment names are case-insensitive; a copied environment object keeps whichever spelling it had (`Path`). */
export function envGet(env, key, platform = process.platform) {
  if (env[key] !== undefined || platform !== 'win32') return env[key];
  return Object.entries(env).find(([name]) => name.toUpperCase() === key.toUpperCase())?.[1];
}

/** The first `name` on PATH (with `.exe` on Windows), or undefined. */
function onPath(name, env, platform) {
  const file = platform === 'win32' ? `${name}.exe` : name;
  for (const directory of (envGet(env, 'PATH', platform) ?? '').split(platform === 'win32' ? ';' : delimiter)) {
    if (directory && existsSync(join(directory, file))) return join(directory, file);
  }
  return undefined;
}

/**
 * OpenSSL: PATH first; on Windows then Git for Windows, which ships it (mingw64 is the native build, usr/bin the MSYS one).
 * `exists` is injectable so the Windows lookup is testable on any OS.
 */
export function findOpenssl(env = process.env, platform = process.platform, exists = existsSync) {
  const found = onPath('openssl', env, platform);
  if (found) return found;
  if (platform === 'win32') {
    const roots = [envGet(env, 'ProgramFiles', platform), envGet(env, 'ProgramW6432', platform), envGet(env, 'ProgramFiles(x86)', platform),
      envGet(env, 'LOCALAPPDATA', platform) && join(envGet(env, 'LOCALAPPDATA', platform), 'Programs')].filter(Boolean);
    for (const root of roots) {
      for (const candidate of [join(root, 'Git', 'mingw64', 'bin', 'openssl.exe'), join(root, 'Git', 'usr', 'bin', 'openssl.exe')]) {
        if (exists(candidate)) return candidate;
      }
    }
    return fail('Local TLS preparation needs openssl: install Git for Windows (it ships openssl.exe) or put openssl.exe on PATH.');
  }
  return fail('Local TLS preparation needs openssl on PATH.');
}

/** The JDK keytool: JAVA_HOME/bin when JAVA_HOME is set, otherwise the one on PATH. */
export function keytool(env = process.env, platform = process.platform) {
  const javaHome = envGet(env, 'JAVA_HOME', platform);
  return javaHome ? join(javaHome, 'bin', platform === 'win32' ? 'keytool.exe' : 'keytool') : 'keytool';
}

function command(tool, args, cwd) {
  try { return execFileSync(tool.path, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { return fail(`Local TLS preparation failed in ${tool.label}; verify installed tools and TLS files (tool output kept private).`); }
}
function privateDir(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Local stack directory must be a private directory, not a symlink.');
  chmodSync(path, 0o700);
}
function readable(path, key, secret = false) {
  try {
    if (!lstatSync(path).isFile() || readFileSync(path).length === 0) throw new Error();
    if (secret && POSIX && (lstatSync(path).mode & 0o077) !== 0) throw new Error();
  } catch { fail(`${key} must name a readable nonempty file${secret && POSIX ? ' with no group/other permissions' : ''}.`); }
}
function certificate(path) {
  try { return new X509Certificate(readFileSync(path)); }
  catch { return fail('Local TLS certificate is invalid; configure valid PEM certificates.'); }
}
function port(env, key, fallback) {
  const value = env[key] || fallback;
  if (!/^\d{1,5}$/.test(value) || Number(value) > 65535) fail(`Local stack: ${key} must be a port number.`);
  return value;
}

/** A token the operator supplied wins; otherwise the stored one is reused; otherwise a new one is drawn. */
function identityToken(path, supplied) {
  if (supplied) { privateWrite(path, supplied); return supplied; }
  try {
    const stored = readFileSync(path, 'utf8').trim();
    if (stored) return stored;
  } catch { /* first init */ }
  const fresh = randomBytes(32).toString('base64url');
  privateWrite(path, fresh);
  return fresh;
}

function issuerKeys(issuerDir) {
  const privatePath = join(issuerDir, 'issuer.private.pem'), publicPath = join(issuerDir, 'issuer.public.pem');
  try {
    const expected = createPublicKey(createPrivateKey(readFileSync(privatePath))).export({ type: 'spki', format: 'pem' });
    const stored = createPublicKey(readFileSync(publicPath)).export({ type: 'spki', format: 'pem' });
    if (expected === stored) return;
  } catch { /* first init, or unreadable: replace both */ }
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateWrite(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  privateWrite(publicPath, publicKey.export({ type: 'spki', format: 'pem' }));
}

/** True when the generated CA and both leaves are present, chain to each other and outlive the renewal margin. */
function generatedTlsUsable(tlsDir) {
  try {
    for (const name of ['ca.key', 'backend.key', 'runner.key', 'store.pass', 'backend.p12', 'trust.p12']) {
      if (!lstatSync(join(tlsDir, name)).isFile()) return false;
    }
    const ca = certificate(join(tlsDir, 'ca.crt')), limit = Date.now() + RENEW_BEFORE_MS;
    for (const name of ['backend', 'runner']) {
      const leaf = certificate(join(tlsDir, `${name}.crt`));
      if (!leaf.verify(ca.publicKey) || Date.parse(leaf.validTo) < limit) return false;
    }
    return Date.parse(ca.validTo) >= limit;
  } catch { return false; }
}

function generateTls(tlsDir, tools) {
  privateWrite(join(tlsDir, 'ca.cnf'), '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=Checks local CA\n[ext]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always\n');
  command(tools.openssl, ['genrsa', '-out', 'ca.key', '2048'], tlsDir);
  command(tools.openssl, ['req', '-new', '-x509', '-sha256', '-key', 'ca.key', '-out', 'ca.crt', '-days', String(CERT_DAYS), '-config', 'ca.cnf'], tlsDir);
  privateWrite(join(tlsDir, 'leaf.ext'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth,clientAuth\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n');
  for (const name of ['backend', 'runner']) {
    command(tools.openssl, ['genrsa', '-out', `${name}.key`, '2048'], tlsDir);
    command(tools.openssl, ['req', '-new', '-key', `${name}.key`, '-out', `${name}.csr`, '-subj', '/CN=localhost'], tlsDir);
    command(tools.openssl, ['x509', '-req', '-sha256', '-in', `${name}.csr`, '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', `${name}.crt`, '-days', String(CERT_DAYS), '-extfile', 'leaf.ext'], tlsDir);
  }
  privateWrite(join(tlsDir, 'store.pass'), randomBytes(32).toString('base64url'));
  command(tools.openssl, ['pkcs12', '-export', '-in', 'backend.crt', '-inkey', 'backend.key', '-certfile', 'ca.crt', '-out', 'backend.p12', '-passout', 'file:store.pass'], tlsDir);
  rmSync(join(tlsDir, 'trust.p12'), { force: true }); // keytool refuses an existing alias
  command(tools.keytool, ['-importcert', '-noprompt', '-alias', 'local-ca', '-file', 'ca.crt', '-keystore', 'trust.p12', '-storetype', 'PKCS12', '-storepass:file', 'store.pass'], tlsDir);
}

function observedCatalog(runnerRoot) {
  let text;
  try { text = execFileSync(process.execPath, ['scripts/print-observed-catalog.mjs', IMAGE_DIGEST], { cwd: runnerRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { return fail('Local stack: the observed catalog could not be printed; run "npm run build" in studio-runner first.'); }
  return { text, catalog: JSON.parse(text) };
}

/**
 * One backend.env line. The file is plain dotenv: `KEY=value`, no quoting, no expansion, read verbatim by
 * backend/scripts/dev.mjs (parseEnvFile below is the same reading). A value that dotenv would misread is refused.
 */
function envLine([key, value]) {
  if (/[\r\n]/.test(value) || /^['"]/.test(value) || /\s#/.test(value) || value !== value.trim()) fail(`Local stack: ${key} cannot be written to backend.env as a plain value.`);
  return `${key}=${value}\n`;
}

/**
 * Reads a dotenv file: `KEY=value` lines, `#` comments, an optional `export ` prefix and optional matching quotes
 * around the value (taken literally: no escapes, no `$VAR` expansion). Used for `.env.local` and backend.env.
 */
export function parseEnvFile(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(raw);
    if (!match || raw.trimStart().startsWith('#')) continue;
    const value = match[2].trim(), quote = value[0];
    values[match[1]] = (quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote)
      ? value.slice(1, -1) : value.replace(/\s+#.*$/, '');
  }
  return values;
}

/**
 * What a Windows process needs beyond PATH and HOME: without SystemRoot Winsock cannot load its providers (no network),
 * and TEMP/TMP are what os.tmpdir() reads there, so they point at the same tmp/ that TMPDIR names on POSIX.
 */
export function windowsEnv(env, dir, platform = process.platform) {
  if (platform !== 'win32') return {};
  const kept = ['SystemRoot', 'windir', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'ComSpec']
    .map((key) => [key, envGet(env, key, platform)]).filter(([, value]) => value);
  return { ...Object.fromEntries(kept), TEMP: join(dir, 'tmp'), TMP: join(dir, 'tmp') };
}

export function init(localDirectory, env = process.env) {
  process.umask(0o077);
  const dir = resolve(localDirectory ?? defaultDir(env));
  privateDir(dir);
  for (const name of ['tls', 'identity', 'issuer', 'tokens', 'journal', 'objects', 'scratch', 'tmp', 'logs']) privateDir(join(dir, name));
  const tlsDir = join(dir, 'tls');
  const tools = { openssl: { path: findOpenssl(env), label: 'OpenSSL' }, keytool: { path: keytool(env), label: 'JDK keytool' } };
  const runnerPort = port(env, 'PUT_CHECKS_RUNNER_PORT', '8090'), backendPort = port(env, 'PUT_CHECKS_BACKEND_PORT', '8080'),
    guidedPort = port(env, 'PUT_CHECKS_GUIDED_PORT', '8092');

  // TLS: operator-supplied files (all or nothing) or the generated, reusable local CA.
  const supplied = [...REQUIRED, ...TYPES].some((key) => (env[key] ?? '') !== '');
  const tls = {};
  let tlsRegenerated = false;
  if (supplied) {
    const missing = REQUIRED.filter((key) => !(env[key] ?? '').trim());
    if (missing.length) fail(`Partial local TLS configuration; set all required keys. Missing: ${missing.join(', ')}. Unset all TLS keys to generate local TLS.`);
    for (const key of REQUIRED) tls[key] = env[key];
    for (const key of TYPES) {
      tls[key] = env[key] || 'PKCS12';
      if (!['PKCS12', 'JKS'].includes(tls[key].toUpperCase())) fail(`${key} must be PKCS12 or JKS.`);
    }
  } else {
    if (!generatedTlsUsable(tlsDir)) {
      tlsRegenerated = existsSync(join(tlsDir, 'ca.crt'));
      generateTls(tlsDir, tools);
    }
    Object.assign(tls, {
      STUDIO_RUNNER_TLS_KEY_FILE: join(tlsDir, 'runner.key'), STUDIO_RUNNER_TLS_CERT_FILE: join(tlsDir, 'runner.crt'),
      STUDIO_RUNNER_TLS_CA_FILE: join(tlsDir, 'ca.crt'),
      STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256: certificate(join(tlsDir, 'backend.crt')).fingerprint256,
      STUDIO_RUNNER_TLS_KEY_STORE: join(tlsDir, 'backend.p12'), STUDIO_RUNNER_TLS_KEY_STORE_PASSWORD_FILE: join(tlsDir, 'store.pass'),
      STUDIO_RUNNER_TLS_TRUST_STORE: join(tlsDir, 'trust.p12'), STUDIO_RUNNER_TLS_TRUST_STORE_PASSWORD_FILE: join(tlsDir, 'store.pass'),
      STUDIO_RUNNER_TLS_KEY_STORE_TYPE: 'PKCS12', STUDIO_RUNNER_TLS_TRUST_STORE_TYPE: 'PKCS12',
    });
  }
  for (const key of REQUIRED.filter((key) => key !== 'STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256')) {
    tls[key] = resolve(tls[key]);
    readable(tls[key], key, /KEY_FILE|KEY_STORE$|TRUST_STORE$|PASSWORD_FILE/.test(key));
  }
  // Health material: the backend's identity as a PKCS12 the readiness probe presents, rebuilt on every init.
  privateWrite(join(tlsDir, 'health.pass'), randomBytes(32).toString('base64url'));
  rmSync(join(tlsDir, 'health.p12'), { force: true });
  command(tools.keytool, ['-importkeystore', '-noprompt', '-srckeystore', tls.STUDIO_RUNNER_TLS_KEY_STORE,
    '-srcstoretype', tls.STUDIO_RUNNER_TLS_KEY_STORE_TYPE, '-srcstorepass:file', tls.STUDIO_RUNNER_TLS_KEY_STORE_PASSWORD_FILE,
    '-destkeystore', join(tlsDir, 'health.p12'), '-deststoretype', 'PKCS12', '-deststorepass:file', join(tlsDir, 'health.pass')], tlsDir);
  command(tools.openssl, ['pkcs12', '-in', 'health.p12', '-passin', 'file:health.pass', '-nokeys', '-out', 'health.crt'], tlsDir);
  const backend = certificate(join(tlsDir, 'health.crt')), runner = certificate(tls.STUDIO_RUNNER_TLS_CERT_FILE);
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
  const trust = command(tools.keytool, ['-list', '-rfc', '-keystore', tls.STUDIO_RUNNER_TLS_TRUST_STORE,
    '-storetype', tls.STUDIO_RUNNER_TLS_TRUST_STORE_TYPE, '-storepass:file', tls.STUDIO_RUNNER_TLS_TRUST_STORE_PASSWORD_FILE], tlsDir);
  privateWrite(join(tlsDir, 'backend-trust.pem'), (trust.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? []).join('\n'));
  for (const [leaf, ca] of [[tls.STUDIO_RUNNER_TLS_CERT_FILE, join(tlsDir, 'backend-trust.pem')], [join(tlsDir, 'health.crt'), tls.STUDIO_RUNNER_TLS_CA_FILE]]) {
    for (const purpose of ['sslserver', 'sslclient']) command(tools.openssl, ['verify', '-CAfile', ca, '-untrusted', leaf, '-purpose', purpose, '-verify_hostname', 'localhost', leaf], tlsDir);
  }

  // Identities and the guided issuer's keys (the tokens themselves are minted by local-tokens.mjs).
  const serviceToken = identityToken(join(dir, 'identity', 'service.token'), env.STUDIO_RUNNER_SERVICE_TOKEN);
  const callbackToken = identityToken(join(dir, 'identity', 'callback.token'), env.STUDIO_CALLBACK_SERVICE_TOKEN);
  issuerKeys(join(dir, 'issuer'));

  // The catalog is the runner build's own identity; the backend reads it at start, so a change needs a backend restart.
  const { text, catalog } = observedCatalog(env.PUT_CHECKS_RUNNER_DIR ? resolve(env.PUT_CHECKS_RUNNER_DIR) : RUNNER_ROOT);
  let previous = null;
  try { previous = readFileSync(join(dir, 'catalog.json'), 'utf8'); } catch { /* first init */ }
  const catalogChanged = previous !== null && previous.trim() !== text;
  privateWrite(join(dir, 'catalog.json'), `${text}\n`);

  const q = JSON.stringify;
  const publicKeyPem = readFileSync(join(dir, 'issuer', 'issuer.public.pem'), 'utf8');
  privateWrite(join(dir, 'backend-overlay.yml'), `# Local guided-bridge overlay for the backend (written by studio-runner/scripts/local-stack.mjs). No secrets: public key, catalog.
studio:
  navigation:
    allowed-domains: ${q('${STUDIO_ALLOWED_DOMAINS:' + DOMAINS + '}')}
    allow-all-domains: ${q('${STUDIO_ALLOW_ALL_DOMAINS:true}')}
  guided-authoring:
    runner-origin: ${q(`https://127.0.0.1:${runnerPort}`)}
    controller-token-file: ${q(join(dir, 'tokens', 'runner-controller.jwt'))}
    service-public-key: ${q(publicKeyPem)}
    service-issuer: ${q(ISSUER)}
    connector:
      port: ${guidedPort}
    translation:
      enabled: true
      worker-id: ${q(WORKER)}
      controller-origin: ${q(`https://127.0.0.1:${guidedPort}`)}
      controller-token-file: ${q(join(dir, 'tokens', 'translation-controller.jwt'))}
      verify-steps: false
      call-seconds: 60
  observed-replay:
    catalog-json: ${q(JSON.stringify([catalog]))}
`);

  const backendEnv = {
    STUDIO_RUNNER_BASE_URL: `https://127.0.0.1:${runnerPort}`,
    STUDIO_RUNNER_SERVICE_TOKEN: serviceToken,
    STUDIO_CALLBACK_SERVICE_TOKEN: callbackToken,
    ...Object.fromEntries(BACKEND_TLS.map((key) => [key, tls[key]])),
    STUDIO_EVIDENCE_PROVIDER: 'local',
    STUDIO_EVIDENCE_DIRECTORY: join(dir, 'objects'),
    // A file: URL (file:///C:/... on Windows), so a drive letter is never read as a URL scheme.
    SPRING_CONFIG_ADDITIONAL_LOCATION: pathToFileURL(join(dir, 'backend-overlay.yml')).href,
  };
  privateWrite(join(dir, 'backend.env'), Object.entries(backendEnv).map(envLine).join(''));

  const runnerEnv = {
    PATH: envGet(env, 'PATH') || '', HOME: env.HOME || '', TMPDIR: join(dir, 'tmp'),
    ...windowsEnv(env, dir),
    ...(env.PLAYWRIGHT_BROWSERS_PATH ? { PLAYWRIGHT_BROWSERS_PATH: env.PLAYWRIGHT_BROWSERS_PATH } : {}),
    STUDIO_RUNNER_HOST: '127.0.0.1', STUDIO_RUNNER_PORT: runnerPort, STUDIO_RUNNER_POOL_SIZE: '1',
    STUDIO_RUNNER_INSTANCE_ID: 'local-ux-runner',
    STUDIO_RUNNER_ALLOWED_DOMAINS: DOMAINS,
    // Allow-all is ON when this key is absent (the default for now). STUDIO_ALLOW_ALL_DOMAINS (the backend's own
    // variable) is passed through verbatim, so `false` enforces the list on both local processes and the runner
    // validates the value exactly.
    ...(env.STUDIO_ALLOW_ALL_DOMAINS ? { STUDIO_RUNNER_ALLOW_ALL_DOMAINS: env.STUDIO_ALLOW_ALL_DOMAINS } : {}),
    STUDIO_RUNNER_SERVICE_IDENTITY: serviceToken,
    STUDIO_RUNNER_CALLBACK_IDENTITY: callbackToken,
    STUDIO_RUNNER_CALLBACK_BASE_URL: `http://127.0.0.1:${backendPort}`,
    // scratch/ is a CHILD of the local dir on purpose: the runner removes its scratch root on exit.
    STUDIO_RUNNER_SCRATCH_DIR: join(dir, 'scratch'), STUDIO_RUNNER_OBJECT_STORE_PROVIDER: 'local', STUDIO_RUNNER_OBJECT_STORE_DIR: join(dir, 'objects'),
    ...Object.fromEntries(REQUIRED.slice(0, 4).map((key) => [key, tls[key]])),
    STUDIO_RUNNER_GUIDED_ENABLED: 'true', STUDIO_RUNNER_GUIDED_CAPACITY: '1', STUDIO_RUNNER_GUIDED_WORKER_ID: WORKER,
    STUDIO_RUNNER_GUIDED_JOURNAL_DIR: join(dir, 'journal'),
    STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER: ISSUER, STUDIO_RUNNER_GUIDED_CONTROLLER_SUBJECT: CONTROLLER,
    STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE: join(dir, 'issuer', 'issuer.public.pem'),
    STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL: `https://127.0.0.1:${guidedPort}`,
    STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE: join(dir, 'tokens', 'worker-callback.jwt'),
    STUDIO_RUNNER_OBSERVED_VALIDATION_ENABLED: 'true', STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED: 'true',
    STUDIO_RUNNER_OBSERVED_CATALOG_FILE: join(dir, 'catalog.json'), STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST: catalog.build.executableImageDigest,
    STUDIO_RUNNER_RECORDING_WIDTH: '1280', STUDIO_RUNNER_RECORDING_HEIGHT: '720',
  };
  privateWrite(join(dir, 'runner-environment.json'), JSON.stringify(runnerEnv));
  return { dir, tls, generated: !supplied, tlsRegenerated, catalogChanged };
}

export async function health(localDirectory) {
  const dir = resolve(localDirectory ?? defaultDir()), tlsDir = join(dir, 'tls');
  const env = JSON.parse(readFileSync(join(dir, 'runner-environment.json'), 'utf8'));
  return new Promise((resolveHealth) => {
    let settled = false;
    const finish = (ok) => { if (!settled) { settled = true; resolveHealth(ok); } };
    const req = request({ hostname: '127.0.0.1', port: Number(env.STUDIO_RUNNER_PORT), path: '/health', method: 'GET',
      ca: readFileSync(join(tlsDir, 'backend-trust.pem')), pfx: readFileSync(join(tlsDir, 'health.p12')),
      passphrase: readFileSync(join(tlsDir, 'health.pass'), 'utf8'), rejectUnauthorized: true,
      headers: { authorization: `Bearer ${env.STUDIO_RUNNER_SERVICE_IDENTITY}` } }, (res) => {
      res.resume(); res.once('end', () => finish(res.statusCode === 200));
    });
    req.setTimeout(2000, () => { req.destroy(); finish(false); }); req.once('error', () => finish(false)); req.end();
  });
}

/**
 * Starts the runner with exactly the environment in runner-environment.json (its config loader refuses any unknown
 * STUDIO_RUNNER_* key, and the backend's own STUDIO_RUNNER_* variables are such keys). On POSIX it gets its own process
 * group, so a terminal Ctrl+C reaches only the caller, which then signals the runner's PID: the runner drains, and the
 * drain is what ends the Chromium trees it forked. On Windows it shares the console, so Ctrl+C reaches it directly.
 */
export function startRunner(localDirectory, { cwd = process.cwd(), stdio = 'inherit' } = {}) {
  const env = JSON.parse(readFileSync(join(resolve(localDirectory ?? defaultDir()), 'runner-environment.json'), 'utf8'));
  return spawn(process.execPath, [resolve(cwd, 'dist', 'main.js')], { cwd, env, stdio, detached: POSIX });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, directory] = process.argv.slice(2);
    if (!['init', 'health', 'run'].includes(mode)) fail('Usage: node scripts/local-stack.mjs init|health|run [<local-directory>]');
    if (mode === 'init') {
      const result = init(directory);
      if (result.catalogChanged) process.stdout.write('The runner build changed (new catalog): restart the backend so it picks up catalog.json.\n');
      if (result.tlsRegenerated) process.stdout.write('Local TLS was regenerated (the old certificates were near expiry or unusable): restart the backend.\n');
    } else if (mode === 'health') process.exitCode = await health(directory) ? 0 : 1;
    else {
      // The runner gets the stopping signal from this process only (its own group on POSIX); on Windows the console
      // delivers Ctrl+C to it directly, and a signal sent from here would be a hard kill, so nothing is forwarded.
      const child = startRunner(directory, { stdio: 'inherit' });
      for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => { if (POSIX) child.kill(signal); });
      process.exitCode = await new Promise((done) => child.once('exit', (code, signal) => done(code ?? 128 + (constants.signals[signal] ?? 0))));
    }
  } catch (error) {
    // Only our fixed messages reach stderr; parser/tool exceptions may contain private file values.
    const message = error instanceof Error && /^(Local TLS|Local stack|Partial local TLS|STUDIO_RUNNER_|Runner TLS|Usage:|Local runner)/.test(error.message)
      ? error.message : 'Local stack preparation failed; verify the complete TLS configuration and installed OpenSSL/JDK tools.';
    process.stderr.write(`${message}\n`); process.exitCode = 1;
  }
}
