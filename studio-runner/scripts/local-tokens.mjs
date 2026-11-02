#!/usr/bin/env node
/**
 * Local guided-bridge token issuer for studio-runner/dev.sh: mints the three short-lived RS256 service JWTs the guided
 * hops need and refreshes them in place every 30 s (they live 240 s).
 *
 *   node scripts/local-tokens.mjs once|serve        (default: serve)
 *
 * The signing key (issuer/) and the token files (tokens/) live in PUT_CHECKS_LOCAL_DIR (default ~/.put-checks/local),
 * outside the repository. `local-stack.mjs init` creates the key; the backend reads the tokens.
 */
import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { sign } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { clearInterval, setInterval } from 'node:timers';

process.umask(0o077);
const dir = process.env.PUT_CHECKS_LOCAL_DIR || join(process.env.HOME || homedir(), '.put-checks', 'local');
const ISS = 'local-ux-issuer', CTRL = 'local-ux-controller', WORKER = 'local-ux-worker';
const TTL_SECONDS = 240, REFRESH_MS = 30000;
const mode = process.argv[2] ?? 'serve';
if (!['once', 'serve'].includes(mode)) {
  process.stderr.write('Usage: node scripts/local-tokens.mjs once|serve\n');
  process.exit(2);
}
let key;
try { key = readFileSync(join(dir, 'issuer', 'issuer.private.pem')); }
catch {
  process.stderr.write('The issuer key is missing; run "node scripts/local-stack.mjs init" first.\n');
  process.exit(1);
}

function mint() {
  mkdirSync(join(dir, 'tokens'), { recursive: true, mode: 0o700 });
  for (const [file, sub, aud, role] of [
    ['runner-controller.jwt', CTRL, 'studio-guided-runner', 'backend-controller'],
    ['translation-controller.jwt', CTRL, 'studio-guided-controller', 'backend-controller'],
    ['worker-callback.jwt', WORKER, 'studio-guided-controller', 'owning-worker']]) {
    const now = Math.floor(Date.now() / 1000), enc = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
    const body = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iss: ISS, sub, aud, role, iat: now, exp: now + TTL_SECONDS })}`;
    const temp = join(dir, 'tokens', `${file}.tmp`);
    writeFileSync(temp, `${body}.${sign('RSA-SHA256', Buffer.from(body), key).toString('base64url')}`, { mode: 0o600 });
    renameSync(temp, join(dir, 'tokens', file));
  }
}

mint();
if (mode === 'serve') {
  const timer = setInterval(mint, REFRESH_MS);
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { clearInterval(timer); process.exit(0); });
  process.stdout.write('local guided token issuer serving\n');
}
