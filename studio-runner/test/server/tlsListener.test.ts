/**
 * STUDIO-OBS-009 AC-3 — the one listener is TLS with client-certificate authentication.
 *
 * Real sockets, real handshakes: a plaintext peer, a peer with no certificate, a peer whose
 * certificate the CA did not issue, a peer the CA issued but nobody pinned, the pinned controller and
 * the runner's own certificate (the exec probe's) are each driven against the listener
 * `createApplication` builds. The certificates are issued here from the fixture CA key by a small DER
 * writer, so the extended-key-usage branches of the startup check are real certificates and not mocks.
 *
 * D1-T1 (ruling Q7): the listener carries the guided server's timeouts, and one replay route and one
 * guided route answer on the same server object.
 */
import { X509Certificate, generateKeyPairSync, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import type { Server } from 'node:https';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { main } from '../../src/main.js';
import { probe } from '../../src/probe.js';
import { createApplication } from '../../src/server/application.js';
import type { RunnerApplication } from '../../src/server/application.js';
import { CONFIG_PREFIX, loadConfig, loadListenerConfig } from '../../src/server/config.js';
import { prepareRecordingScratch } from '../../src/run/recordingScratch.js';
import { LISTENER_TIMEOUTS, readListenerMaterial } from '../../src/server/server.js';
import type { ListenerSettings } from '../../src/server/server.js';
import { assignmentFor, guidedContext } from '../helpers/guided.js';
import { jwt, testCert, testFingerprint, testKey, testTls } from '../helpers/guidedTls.js';
import { RUNTIME_VERSIONS, SERVICE_TOKEN } from '../helpers/harness.js';
import { createFakeBrowserLauncher } from '../helpers/runner.js';

const P = CONFIG_PREFIX;

// ── A minimal X.509 writer: just enough to issue leaf certificates from the fixture CA key. ──────
const der = (tag: number, ...parts: Buffer[]): Buffer => {
  const body = Buffer.concat(parts);
  const length = body.length;
  const header = length < 128 ? [tag, length] : length < 256 ? [tag, 0x81, length] : [tag, 0x82, length >> 8, length & 0xff];
  return Buffer.concat([Buffer.from(header), body]);
};
const oid = (dotted: string): Buffer => {
  const [first = 0, second = 0, ...rest] = dotted.split('.').map(Number);
  const bytes = [first * 40 + second];
  for (const part of rest) {
    const chunk = [part & 0x7f];
    for (let value = part >> 7; value > 0; value >>= 7) chunk.unshift((value & 0x7f) | 0x80);
    bytes.push(...chunk);
  }
  return der(0x06, Buffer.from(bytes));
};
const commonName = (name: string): Buffer => der(0x30, der(0x31, der(0x30, oid('2.5.4.3'), der(0x0c, Buffer.from(name)))));
const utcTime = (date: Date): Buffer => der(0x17, Buffer.from(`${date.toISOString().slice(2, 19).replace(/[-:T]/gu, '')}Z`));
const extension = (id: string, value: Buffer): Buffer => der(0x30, oid(id), der(0x04, value));
const SHA256_RSA = der(0x30, oid('1.2.840.113549.1.1.11'), der(0x05));

const EKU = { serverAuth: '1.3.6.1.5.5.7.3.1', clientAuth: '1.3.6.1.5.5.7.3.2', codeSigning: '1.3.6.1.5.5.7.3.3', any: '2.5.29.37.0' };

/**
 * A certificate for `publicKey`, issued by the fixture key (`CN=localhost`) unless `issuer` says otherwise,
 * with the given EKU list (or no EKU extension).
 */
function issue(publicKey: KeyObject, subject: string, eku: readonly string[] | undefined, issuer: { key: KeyObject; name: string } = { key: testKey as unknown as KeyObject, name: 'localhost' }): Buffer {
  const san = extension('2.5.29.17', der(0x30, der(0x82, Buffer.from('localhost')), der(0x87, Buffer.from([127, 0, 0, 1]))));
  const extensions = [san, ...(eku === undefined ? [] : [extension('2.5.29.37', der(0x30, ...eku.map(oid)))])];
  const tbs = der(
    0x30,
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, Buffer.from([0x01, ...Array.from({ length: 6 }, () => Math.floor(Math.random() * 127) + 1)])),
    SHA256_RSA,
    commonName(issuer.name),
    der(0x30, utcTime(new Date(Date.now() - 3_600_000)), utcTime(new Date(Date.now() + 86_400_000))),
    commonName(subject),
    publicKey.export({ type: 'spki', format: 'der' }),
    der(0xa3, der(0x30, ...extensions)),
  );
  const signature = sign('RSA-SHA256', tbs, issuer.key);
  const certificate = der(0x30, tbs, SHA256_RSA, der(0x03, Buffer.from([0]), signature));
  const lines = certificate.toString('base64').match(/.{1,64}/gu) ?? [];
  return Buffer.from(`-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`);
}

let leaf: { privateKey: KeyObject; publicKey: KeyObject };
let other: { privateKey: KeyObject; publicKey: KeyObject };
beforeAll(() => {
  leaf = generateKeyPairSync('rsa', { modulusLength: 2048 });
  other = generateKeyPairSync('rsa', { modulusLength: 2048 });
});

const tlsFor = (certificate: Buffer, key: KeyObject): { key: Buffer; cert: Buffer; ca: Buffer } => ({
  key: key.export({ type: 'pkcs8', format: 'pem' }) as Buffer,
  cert: certificate,
  ca: testCert,
});

describe('the startup check of the runner certificate (ruling 1.5 d)', () => {
  const material = (certificate: Buffer, key: KeyObject = leaf.privateKey) => {
    const files = new Map<string, Buffer>([
      ['/m/key', key.export({ type: 'pkcs8', format: 'pem' }) as Buffer],
      ['/m/cert', certificate],
      ['/m/ca', testCert],
    ]);
    return readListenerMaterial(
      { tlsKeyFile: '/m/key', tlsCertFile: '/m/cert', tlsCaFile: '/m/ca', controllerCertificateFingerprint256: testFingerprint },
      (file) => {
        const bytes = files.get(file);
        if (bytes === undefined) throw new Error('ENOENT');
        return bytes;
      },
    );
  };
  const refusal = 'STUDIO_RUNNER_TLS_CERT_FILE carries an extended key usage without serverAuth or without clientAuth; the runner certificate must allow both.';

  it('passes a leaf with no extended key usage extension, and one that allows both uses', () => {
    expect(new X509Certificate(issue(leaf.publicKey, 'runner', undefined)).keyUsage).toBeUndefined();
    expect(material(issue(leaf.publicKey, 'runner', undefined))).toMatchObject({ ok: true });
    expect(material(issue(leaf.publicKey, 'runner', [EKU.serverAuth, EKU.clientAuth]))).toMatchObject({ ok: true });
    expect(material(issue(leaf.publicKey, 'runner', [EKU.clientAuth, EKU.codeSigning, EKU.serverAuth]))).toMatchObject({ ok: true });
    expect(material(issue(leaf.publicKey, 'runner', [EKU.any]))).toMatchObject({ ok: true });
  });

  it('refuses a leaf whose extension lacks serverAuth, lacks clientAuth, or names neither', () => {
    for (const eku of [[EKU.serverAuth], [EKU.clientAuth], [EKU.codeSigning]]) {
      const outcome = material(issue(leaf.publicKey, 'runner', eku));
      expect(outcome, eku.join()).toEqual({ ok: false, problems: [refusal] });
    }
  });

  it('refuses a key that does not belong to the certificate, an empty file, a non-PEM file and a missing file, without a path or content', () => {
    expect(material(issue(leaf.publicKey, 'runner', undefined), other.privateKey)).toEqual({
      ok: false,
      problems: ['STUDIO_RUNNER_TLS_KEY_FILE does not belong to STUDIO_RUNNER_TLS_CERT_FILE.'],
    });
    const read = (bytes: Buffer | 'throw') => (file: string): Buffer => {
      if (bytes === 'throw' || file !== '/m/cert') {
        if (file === '/m/cert' && bytes === 'throw') throw new Error('/secret/path ENOENT');
        return file === '/m/key' ? (leaf.privateKey.export({ type: 'pkcs8', format: 'pem' }) as Buffer) : testCert;
      }
      return bytes;
    };
    const config = { tlsKeyFile: '/m/key', tlsCertFile: '/m/cert', tlsCaFile: '/m/ca', controllerCertificateFingerprint256: testFingerprint };
    expect(readListenerMaterial(config, read(Buffer.alloc(0)))).toEqual({ ok: false, problems: ['STUDIO_RUNNER_TLS_CERT_FILE is empty.'] });
    expect(readListenerMaterial(config, read(Buffer.from('plain text')))).toEqual({ ok: false, problems: ['STUDIO_RUNNER_TLS_CERT_FILE is not PEM.'] });
    expect(readListenerMaterial(config, read('throw'))).toEqual({ ok: false, problems: ['STUDIO_RUNNER_TLS_CERT_FILE could not be read.'] });
  });

  it('refuses the start through main with exit 78 and the same value-free line', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tls-listener-'));
    try {
      writeFileSync(join(root, 'cert.pem'), issue(leaf.publicKey, 'runner', [EKU.serverAuth]));
      writeFileSync(join(root, 'key.pem'), leaf.privateKey.export({ type: 'pkcs8', format: 'pem' }));
      const lines: string[] = [];
      let exit: number | null = null;
      const result = await main({
        env: {
          [`${P}PORT`]: '0', [`${P}HOST`]: '127.0.0.1', [`${P}SERVICE_IDENTITY`]: SERVICE_TOKEN, [`${P}CALLBACK_IDENTITY`]: 'o',
          [`${P}CALLBACK_BASE_URL`]: 'https://api.internal.example', [`${P}SCRATCH_DIR`]: join(root, 's'), [`${P}OBJECT_STORE_DIR`]: join(root, 'o'),
          [`${P}TLS_KEY_FILE`]: join(root, 'key.pem'), [`${P}TLS_CERT_FILE`]: join(root, 'cert.pem'), [`${P}TLS_CA_FILE`]: join(root, 'ca.pem'),
          [`${P}CONTROLLER_CERTIFICATE_FINGERPRINT256`]: testFingerprint,
        },
        onSignal: () => { throw new Error('a refused start must not wire the drain'); },
        write: (line) => lines.push(line),
        setExitCode: (code) => { exit = code; },
        launcher: createFakeBrowserLauncher(),
      });
      expect(result).toEqual({ started: false });
      expect(exit).toBe(78);
      expect(lines).toContain(`configuration rejected: ${refusal}`);
      expect(lines.join('\n')).not.toContain(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

interface Reply { status: number; body: unknown }

function call(
  port: number,
  method: string,
  path: string,
  client: { key: Buffer; cert: Buffer } | null,
  authorization: string | null = `Bearer ${SERVICE_TOKEN}`,
  body = '',
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(body);
    const req = request(
      { hostname: '127.0.0.1', port, path, method, ca: testCert, ...(client ?? {}),
        headers: { ...(authorization === null ? {} : { authorization }), 'content-type': 'application/json', 'content-length': String(payload.length) } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode ?? 0, body: text === '' ? null : JSON.parse(text) as unknown });
        });
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

describe('the one TLS listener', () => {
  const apps: RunnerApplication[] = [];
  const dirs: string[] = [];
  afterEach(async () => {
    while (apps.length > 0) await apps.pop()?.drain();
    while (dirs.length > 0) rmSync(dirs.pop() ?? '', { recursive: true, force: true });
  });

  /**
   * A runner whose certificate is a leaf the fixture CA issued (so it differs from the controller's),
   * with the controller pinned to the fixture certificate. `guided` adds the bridge with a launcher that never runs.
   */
  async function serve(options: { guided?: boolean; chain?: boolean } = {}): Promise<{ app: RunnerApplication; port: number; own: { key: Buffer; cert: Buffer }; controller: { key: Buffer; cert: Buffer }; unpinned: { key: Buffer; cert: Buffer }; raw: Server }> {
    const root = mkdtempSync(join(tmpdir(), 'tls-listener-'));
    dirs.push(root);
    const ownCert = issue(leaf.publicKey, 'runner', [EKU.serverAuth, EKU.clientAuth]);
    const own = tlsFor(options.chain === true ? Buffer.concat([ownCert, testCert]) : ownCert, leaf.privateKey);
    const settings: ListenerSettings = { tls: own, controllerCertificateFingerprint256: testFingerprint };
    const app = createApplication(
      loadConfig({
        [`${P}PORT`]: '0', [`${P}HOST`]: '127.0.0.1', [`${P}SERVICE_IDENTITY`]: SERVICE_TOKEN, [`${P}CALLBACK_IDENTITY`]: 'o',
        [`${P}CALLBACK_BASE_URL`]: 'https://api.internal.example', [`${P}SCRATCH_DIR`]: join(root, 's'), [`${P}OBJECT_STORE_DIR`]: join(root, 'o'),
      }),
      {
        listener: settings,
        launcher: createFakeBrowserLauncher(),
        runtimeVersions: RUNTIME_VERSIONS,
        logSink: { write: () => undefined },
        ...(options.guided === true
          ? { guided: await guidedDependencies(root) }
          : {}),
      },
    );
    apps.push(app);
    const port = await app.start();
    return {
      app, port, raw: app.server.raw, own: { key: own.key, cert: ownCert },
      controller: { key: testTls.key, cert: testTls.cert },
      unpinned: { key: other.privateKey.export({ type: 'pkcs8', format: 'pem' }) as Buffer, cert: issue(other.publicKey, 'someone-else', [EKU.clientAuth]) },
    };
  }

  async function guidedDependencies(root: string) {
    return {
      workerId: 'worker-one',
      capacity: 1,
      journalDirectory: join(root, 'journal'),
      controllerJwt: { issuer: 'fixture-issuer', subject: 'controller', publicKey: testCert.toString() },
      callbackBaseUrl: 'https://127.0.0.1:9',
      callbackToken: () => Promise.resolve('token'),
      launch: () => Promise.reject(new Error('no browser in this tier')),
      recordingScratch: await prepareRecordingScratch({ workerId: 'worker-one', journalDirectory: join(root, 'journal'), evidenceRoot: root }),
    };
  }

  it('D1-T1: carries headersTimeout 10 s, requestTimeout 15 s and a 30 s socket timeout, and serves a replay route and a guided route on the same server object', async () => {
    const { raw, port, controller } = await serve({ guided: true });
    expect(LISTENER_TIMEOUTS).toEqual({ headersTimeoutMs: 10_000, requestTimeoutMs: 15_000, socketTimeoutMs: 30_000 });
    expect(raw.headersTimeout).toBe(10_000);
    expect(raw.requestTimeout).toBe(15_000);
    expect(raw.timeout).toBe(30_000);
    // The replay route.
    expect((await call(port, 'GET', '/health', controller)).status).toBe(200);
    // The guided route, on the same server object: it reaches the bridge, which refuses a bad JWT in its own closed vocabulary.
    const context = guidedContext('https://example.test');
    const guided = await call(port, 'POST', `/internal/v2/studio/guided-sessions/${context.sessionId}/assign`, controller, `Bearer ${jwt({ aud: 'wrong' })}`, JSON.stringify(assignmentFor(context)));
    expect(guided).toEqual({ status: 401, body: { code: 'AUTH_DENIED' } });
    expect(raw.listening).toBe(true);
    expect((raw.address() as { port: number }).port).toBe(port);
  });

  it('speaks TLS only: a plaintext request gets no HTTP answer, and a peer with no certificate gets none either', async () => {
    const { port } = await serve();
    const plain = await new Promise<string>((resolve) => {
      const socket = connect(port, '127.0.0.1', () => { socket.write(`GET /health HTTP/1.1\r\nhost: x\r\nauthorization: Bearer ${SERVICE_TOKEN}\r\nconnection: close\r\n\r\n`); });
      let received = '';
      socket.on('data', (chunk: Buffer) => { received += chunk.toString('latin1'); });
      socket.on('close', () => { resolve(received); });
      socket.on('error', () => { resolve(received); });
    });
    expect(plain).not.toContain('HTTP/1.');
    expect(plain).not.toContain('"status"');
    await expect(call(port, 'GET', '/health', null)).rejects.toThrow();
  });

  it('refuses, during the handshake, a certificate the CA did not issue', async () => {
    const { port } = await serve();
    const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 });
    // Self-signed by its own key: not chained to the test CA.
    const selfSigned = {
      key: stranger.privateKey.export({ type: 'pkcs8', format: 'pem' }) as Buffer,
      cert: issue(stranger.publicKey, 'stranger', [EKU.clientAuth], { key: stranger.privateKey, name: 'stranger' }),
    };
    await expect(call(port, 'GET', '/health', selfSigned)).rejects.toThrow();
  });

  it('answers 401 PEER_REJECTED to a CA-issued but unpinned certificate on every route, before the bearer is looked at', async () => {
    const { port, unpinned } = await serve({ guided: false });
    const context = guidedContext('https://example.test');
    for (const [method, path] of [
      ['GET', '/health'], ['GET', '/ready'], ['POST', '/v2/runs'], ['POST', '/v2/validate-observed'], ['DELETE', '/v2/runs/abc'],
      ['GET', '/nowhere'], ['POST', `/internal/v2/studio/guided-sessions/${context.sessionId}/assign`],
    ] as const) {
      for (const authorization of [`Bearer ${SERVICE_TOKEN}`, 'Bearer wrong', null]) {
        expect(await call(port, method, path, unpinned, authorization, '{}'), `${method} ${path} ${String(authorization)}`).toEqual({ status: 401, body: { code: 'PEER_REJECTED' } });
      }
    }
  });

  it('serves the pinned controller on every replay route, with the bearer still a second factor', async () => {
    const { port, controller } = await serve();
    expect((await call(port, 'GET', '/health', controller)).body).toEqual({ status: 'ok', draining: false });
    expect((await call(port, 'GET', '/ready', controller)).status).toBe(200);
    expect(await call(port, 'GET', '/health', controller, null)).toEqual({ status: 401, body: { code: 'IDENTITY_MISSING' } });
    expect(await call(port, 'GET', '/health', controller, 'Bearer wrong')).toEqual({ status: 403, body: { code: 'IDENTITY_REJECTED' } });
    expect(await call(port, 'POST', '/v2/runs', controller, `Bearer ${SERVICE_TOKEN}`, '{}')).toEqual({ status: 503, body: { code: 'OBSERVED_REPLAY_DISABLED' } });
    expect(await call(port, 'DELETE', '/v2/runs/abc', controller)).toEqual({ status: 404, body: { code: 'RUN_NOT_FOUND' } });
    expect(await call(port, 'GET', '/nowhere', controller)).toEqual({ status: 404, body: { code: 'NOT_FOUND' } });
  });

  it("accepts the runner's own certificate on /health and /ready only (the exec probe), never on a run, a cancel or a guided route", async () => {
    const { port, own } = await serve();
    expect((await call(port, 'GET', '/health', own)).status).toBe(200);
    expect((await call(port, 'GET', '/ready', own)).status).toBe(200);
    for (const [method, path] of [['POST', '/v2/runs'], ['POST', '/v2/validate-observed'], ['DELETE', '/v2/runs/abc'], ['GET', '/nowhere'], ['POST', '/internal/v2/studio/guided-sessions/s/assign']] as const) {
      expect(await call(port, method, path, own, `Bearer ${SERVICE_TOKEN}`, '{}'), `${method} ${path}`).toEqual({ status: 401, body: { code: 'PEER_REJECTED' } });
    }
    // Still behind the bearer.
    expect(await call(port, 'GET', '/health', own, 'Bearer wrong')).toEqual({ status: 403, body: { code: 'IDENTITY_REJECTED' } });
  });

  it('the exec probe, presenting the runner certificate, is served over this listener; a draining runner is live but not ready', async () => {
    const { port, app, own } = await serve();
    const tls = { key: own.key, cert: own.cert, ca: testCert };
    expect(await probe(port, '/health', SERVICE_TOKEN, tls)).toBe(true);
    expect(await probe(port, '/ready', SERVICE_TOKEN, tls)).toBe(true);
    expect(await probe(port, '/health', 'wrong', tls)).toBe(false);
    app.pool.beginDrain();
    expect(await probe(port, '/ready', SERVICE_TOKEN, tls)).toBe(false);
    expect(await probe(port, '/health', SERVICE_TOKEN, tls)).toBe(true);
  });

  it('pins the leaf of a chain file: the probe and the listener agree on the first certificate', async () => {
    const { port, own } = await serve({ chain: true });
    const chain = Buffer.concat([own.cert, testCert]);
    expect(await probe(port, '/health', SERVICE_TOKEN, { key: own.key, cert: chain, ca: testCert })).toBe(true);
    expect(new X509Certificate(chain).fingerprint256).toBe(new X509Certificate(own.cert).fingerprint256);
  });

  it('the probe refuses a server that is not the pod itself, even when the CA vouches for it', async () => {
    const { port, controller } = await serve();
    // The probe presents the controller certificate as its "own": the listener serves the runner's leaf, so the pin fails.
    expect(await probe(port, '/health', SERVICE_TOKEN, { key: controller.key, cert: controller.cert, ca: testCert })).toBe(false);
    // A probe whose CA bundle does not vouch for the server fails the chain before the pin.
    const { own } = await serve();
    const stranger = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const strangerCert = issue(stranger.publicKey, 'stranger', [EKU.serverAuth], { key: stranger.privateKey, name: 'stranger' });
    expect(await probe(port, '/health', SERVICE_TOKEN, { key: own.key, cert: own.cert, ca: strangerCert })).toBe(false);
  });

  it('refuses to build a runner without a controller pin or a certificate', () => {
    expect(() => loadListenerConfig({})).toThrow();
    const files = readListenerMaterial(
      { tlsKeyFile: '/m/key', tlsCertFile: '/m/cert', tlsCaFile: '/m/ca', controllerCertificateFingerprint256: testFingerprint },
      () => { throw new Error('ENOENT'); },
    );
    expect(files).toMatchObject({ ok: false });
  });
});
