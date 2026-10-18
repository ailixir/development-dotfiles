/**
 * Authenticated loopback health checks for Kubernetes exec probes. Never prints the token, a path
 * or a fingerprint.
 *
 * The runner has one listener and it is TLS with client-certificate authentication
 * (STUDIO-OBS-009 AC-3, ruling A3), so the probe is a TLS client of its own pod: it presents the
 * runner's own certificate as its client certificate and verifies the server against the same CA.
 * The server certificate is reached by `127.0.0.1`, which its subject alternative names need not
 * contain, so host-name verification is replaced by a pin: the peer certificate must be the very
 * certificate this probe presents (the leaf, the first certificate of the file). The listener accepts
 * that certificate on `/health` and `/ready` only, next to the bearer.
 *
 * The command Helm renders does not change: `node dist/probe.js <path>`. The three files are read at
 * every exec, the listener reads them once, so a Secret refresh without a restart makes the pin fail;
 * a rotation is a Secret update, a rollout restart and a fingerprint update in one release.
 */
import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { get } from 'node:https';
import { fileURLToPath } from 'node:url';

export interface ProbeTls {
  readonly key: Buffer | string;
  readonly cert: Buffer | string;
  readonly ca: Buffer | string;
}

/** Reads the runner's TLS files from its environment. `null` when any is unset or unreadable. */
export function readProbeTls(env: Readonly<Record<string, string | undefined>>): ProbeTls | null {
  const files = [env.STUDIO_RUNNER_TLS_KEY_FILE, env.STUDIO_RUNNER_TLS_CERT_FILE, env.STUDIO_RUNNER_TLS_CA_FILE];
  const [keyFile, certFile, caFile] = files;
  if (keyFile === undefined || certFile === undefined || caFile === undefined) return null;
  if (keyFile === '' || certFile === '' || caFile === '') return null;
  try {
    return { key: readFileSync(keyFile), cert: readFileSync(certFile), ca: readFileSync(caFile) };
  } catch {
    return null;
  }
}

export function probe(
  port: number,
  path: '/health' | '/ready',
  token: string,
  tls: ProbeTls | null,
): Promise<boolean> {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || token.trim() === '' || tls === null) {
    return Promise.resolve(false);
  }
  let own: string;
  try {
    own = new X509Certificate(tls.cert).fingerprint256;
  } catch {
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    try {
      const request = get(
        {
          hostname: '127.0.0.1',
          port,
          path,
          key: tls.key,
          cert: tls.cert,
          ca: tls.ca,
          minVersion: 'TLSv1.2',
          rejectUnauthorized: true,
          agent: false,
          // Pin the leaf instead of the host name; the CA chain is still verified.
          checkServerIdentity: (_host, peer) =>
            peer.fingerprint256 === own ? undefined : new Error('probe pin mismatch'),
          headers: { authorization: `Bearer ${token}` },
          timeout: 2000,
        },
        (response) => {
          response.resume();
          resolve(response.statusCode === 200);
        },
      );
      request.on('timeout', () => { request.destroy(); resolve(false); });
      request.on('error', () => { resolve(false); });
    } catch {
      resolve(false);
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (path !== '/health' && path !== '/ready') {
    process.exitCode = 1;
  } else {
    process.exitCode = await probe(Number(process.env.STUDIO_RUNNER_PORT ?? '8080'), path,
      process.env.STUDIO_RUNNER_SERVICE_IDENTITY ?? '', readProbeTls(process.env)) ? 0 : 1;
  }
}
