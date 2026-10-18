/**
 * The one listener (STUDIO-OBS-009 AC-1, AC-3; ruling A3; drop D1.0 sections 2.3 and 4).
 *
 * **`node:https`, and nothing else.** The runner serves the replay routes, the validate route and
 * the guided bridge on this one server. It requires a client certificate that chains to the
 * configured CA on every connection (`requestCert` and `rejectUnauthorized`), so an unauthenticated
 * peer is refused during the handshake, before a byte of HTTP is parsed. There is no `node:http`
 * listener in this module, in any configuration, and no option that would select one.
 *
 * ADR-001 §5 still holds for the rest: the route surface is a handful of routes with no
 * middleware, and Node's built-in server covers it with **zero new production dependencies**, which
 * keeps the resolved production closure at `playwright`, `playwright-core` and `typescript`.
 *
 * The drain path is the reason `close` takes two steps. Flipping readiness and refusing new work
 * happens immediately; actually closing the listener happens only after the in-flight run has
 * delivered its terminal report or its deadline has passed. A process that exits between the two
 * abandons an admitted attempt, which is the failure mode AC-12 exists to prevent.
 */
import { X509Certificate, createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import type { Server } from 'node:https';
import type { ListenerConfig } from './config.js';
import type { RouteOptions } from './routes.js';
import { createRequestHandler } from './routes.js';

/**
 * Timeouts of the single listener (ruling Q7): one server-level set for every route family. They are
 * the values the guided server used (`headersTimeout` and `requestTimeout` are server-level in Node,
 * and the route is not known until the head is parsed); the replay routes answer well inside them.
 * The 30 s socket timeout is a backstop above the guided close bound (ruling D5), never the bound.
 */
export const LISTENER_TIMEOUTS = Object.freeze({
  headersTimeoutMs: 10_000,
  requestTimeoutMs: 15_000,
  socketTimeoutMs: 30_000,
});

/** PEM material of the listener. The same key pair is the runner's client identity on its callbacks. */
export interface ListenerTls {
  readonly key: Buffer;
  readonly cert: Buffer;
  readonly ca: Buffer;
}

export interface ListenerSettings {
  readonly tls: ListenerTls;
  /** Fingerprint of the backend's client certificate (`X509Certificate.fingerprint256`). */
  readonly controllerCertificateFingerprint256: string;
}

export interface RunnerServer {
  listen(port: number, host: string): Promise<number>;
  /** Stops accepting connections and resolves when open ones have finished. */
  close(): Promise<void>;
  /** Ends every connection, in flight or not. Used once the guided half of the drain has settled. */
  closeAllConnections(): void;
  /** Bound port; `0` before `listen` resolves. */
  readonly port: number;
  readonly raw: Server;
}

export interface RunnerServerOptions extends RouteOptions {
  readonly listener: ListenerSettings;
}

export function createRunnerServer(options: RunnerServerOptions): RunnerServer {
  const handler = createRequestHandler(options);
  const server = createServer(
    {
      key: options.listener.tls.key,
      cert: options.listener.tls.cert,
      ca: options.listener.tls.ca,
      minVersion: 'TLSv1.2',
      requestCert: true,
      rejectUnauthorized: true,
    },
    (request, response) => {
      handler(request, response);
    },
  );
  server.headersTimeout = LISTENER_TIMEOUTS.headersTimeoutMs;
  server.requestTimeout = LISTENER_TIMEOUTS.requestTimeoutMs;
  server.timeout = LISTENER_TIMEOUTS.socketTimeoutMs;
  let port = 0;

  return {
    raw: server,
    get port(): number {
      return port;
    },
    listen(requested: number, host: string): Promise<number> {
      return new Promise<number>((resolve, reject) => {
        const onError = (error: Error): void => {
          reject(error);
        };
        server.once('error', onError);
        server.listen(requested, host, () => {
          server.removeListener('error', onError);
          const address = server.address();
          port = typeof address === 'object' && address !== null ? (address).port : requested;
          resolve(port);
        });
      });
    },
    close(): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close(() => {
          resolve();
        });
        // Idle keep-alive sockets would otherwise hold the close open past the drain deadline.
        server.closeIdleConnections();
      });
    },
    closeAllConnections(): void {
      server.closeAllConnections();
    },
  };
}

const SERVER_AUTH = '1.3.6.1.5.5.7.3.1';
const CLIENT_AUTH = '1.3.6.1.5.5.7.3.2';
const ANY_EXTENDED_KEY_USAGE = '2.5.29.37.0';

/**
 * Why the listener material was refused, or the material. Every problem is one value-free line: it
 * names the key, never a path, a fingerprint or a byte of the file (drop D1.0 section 2.3).
 */
export type ListenerMaterial =
  | { readonly ok: true; readonly settings: ListenerSettings }
  | { readonly ok: false; readonly problems: readonly string[] };

/**
 * Reads the listener's PEM files once, at startup, and refuses what could not serve: an unreadable or
 * empty file, a file that is not PEM, a key that does not belong to the certificate, a CA with no
 * certificate in it, and (ruling 1.5 d) a leaf whose extended key usage extension is present without
 * `serverAuth` or without `clientAuth`. A leaf with no such extension is valid for every purpose.
 *
 * The probe presents this certificate as a *client* certificate and the guided callbacks present the
 * same key pair as a client, so a `serverAuth`-only leaf would leave a pod that never turns Ready and
 * logs nothing; this refuses it before anything listens.
 */
export function readListenerMaterial(
  config: ListenerConfig,
  read: (file: string) => Buffer = (file) => readFileSync(file),
): ListenerMaterial {
  const problems: string[] = [];
  const load = (name: string, file: string): Buffer | null => {
    let bytes: Buffer;
    try {
      bytes = read(file);
    } catch {
      problems.push(`${name} could not be read.`);
      return null;
    }
    if (bytes.length === 0) {
      problems.push(`${name} is empty.`);
      return null;
    }
    if (!bytes.includes('-----BEGIN ')) {
      problems.push(`${name} is not PEM.`);
      return null;
    }
    return bytes;
  };
  const key = load('STUDIO_RUNNER_TLS_KEY_FILE', config.tlsKeyFile);
  const cert = load('STUDIO_RUNNER_TLS_CERT_FILE', config.tlsCertFile);
  const ca = load('STUDIO_RUNNER_TLS_CA_FILE', config.tlsCaFile);

  let privateKey: ReturnType<typeof createPrivateKey> | null = null;
  if (key !== null) {
    try {
      privateKey = createPrivateKey(key);
    } catch {
      problems.push('STUDIO_RUNNER_TLS_KEY_FILE is not a usable PEM private key.');
    }
  }
  if (cert !== null) {
    let leaf: X509Certificate | null = null;
    try {
      leaf = new X509Certificate(cert);
    } catch {
      problems.push('STUDIO_RUNNER_TLS_CERT_FILE is not a PEM certificate.');
    }
    if (leaf !== null) {
      if (privateKey !== null && !leaf.checkPrivateKey(privateKey)) {
        problems.push('STUDIO_RUNNER_TLS_KEY_FILE does not belong to STUDIO_RUNNER_TLS_CERT_FILE.');
      }
      const usages = leaf.keyUsage as readonly string[] | undefined;
      if (usages !== undefined && !usages.includes(ANY_EXTENDED_KEY_USAGE)) {
        if (!usages.includes(SERVER_AUTH) || !usages.includes(CLIENT_AUTH)) {
          problems.push(
            'STUDIO_RUNNER_TLS_CERT_FILE carries an extended key usage without serverAuth or without clientAuth; the runner certificate must allow both.',
          );
        }
      }
    }
  }
  if (ca !== null) {
    try {
      void new X509Certificate(ca);
    } catch {
      problems.push('STUDIO_RUNNER_TLS_CA_FILE holds no PEM certificate.');
    }
  }

  if (problems.length > 0 || key === null || cert === null || ca === null) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    settings: {
      tls: { key, cert, ca },
      controllerCertificateFingerprint256: config.controllerCertificateFingerprint256,
    },
  };
}
