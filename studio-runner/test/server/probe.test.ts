import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:https';
import { TLSSocket } from 'node:tls';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { probe, readProbeTls } from '../../src/probe.js';
import { testFingerprint, testTls } from '../helpers/guidedTls.js';

const fixture = (name: string): string => fileURLToPath(new URL(`../fixtures/guided-tls/${name}.fixture`, import.meta.url));

/** A stand-in listener: requires the CA-verified client certificate, answers like the runner's probe routes. */
function stub(): Promise<{ port: number; close: () => Promise<void>; peers: string[] }> {
  const peers: string[] = [];
  const server = createServer({ ...testTls, requestCert: true, rejectUnauthorized: true }, (request, response) => {
    request.resume();
    if (request.socket instanceof TLSSocket) peers.push(request.socket.getPeerCertificate().fingerprint256);
    const authenticated = request.headers.authorization === 'Bearer test-probe-identity';
    response.writeHead(authenticated ? (request.url === '/health' ? 200 : 503) : 401);
    response.end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('Missing fixture port');
      resolve({ port: address.port, peers, close: () => new Promise<void>((done) => { server.close(() => { done(); }); server.closeAllConnections(); }) });
    });
  });
}

describe('authenticated deployment probes', () => {
  it('sends the configured bearer identity and its own client certificate over TLS, and distinguishes health from readiness', async () => {
    const { port, close, peers } = await stub();
    try {
      expect(await probe(port, '/health', 'test-probe-identity', testTls)).toBe(true);
      expect(await probe(port, '/ready', 'test-probe-identity', testTls)).toBe(false);
      expect(await probe(port, '/health', 'wrong-identity', testTls)).toBe(false);
      expect(await probe(port, '/health', '', testTls)).toBe(false);
      expect(await probe(0, '/health', 'test-probe-identity', testTls)).toBe(false);
      // The server saw the probe's own certificate on every connection that reached HTTP.
      expect(peers.length).toBeGreaterThan(0);
      expect(new Set(peers)).toEqual(new Set([testFingerprint]));
    } finally {
      await close();
    }
    expect(await probe(port, '/health', 'test-probe-identity', testTls)).toBe(false);
  });

  it('is false without TLS material, and never reaches a plaintext listener', async () => {
    const { port, close } = await stub();
    try {
      expect(await probe(port, '/health', 'test-probe-identity', null)).toBe(false);
    } finally {
      await close();
    }
    // A plaintext server answers 200 to anything. The probe speaks TLS only, so the handshake fails.
    const plain = createHttpServer((request, response) => { request.resume(); response.writeHead(200); response.end(); });
    await new Promise<void>((resolve) => { plain.listen(0, '127.0.0.1', resolve); });
    const address = plain.address();
    if (address === null || typeof address === 'string') throw new Error('Missing fixture port');
    try {
      expect(await probe(address.port, '/health', 'test-probe-identity', testTls)).toBe(false);
    } finally {
      plain.closeAllConnections();
      await new Promise<void>((resolve) => { plain.close(() => { resolve(); }); });
    }
  });

  it('is false for a certificate file it cannot parse (no throw, no output)', async () => {
    const { port, close } = await stub();
    try {
      expect(await probe(port, '/health', 'test-probe-identity', { ...testTls, cert: Buffer.from('not a certificate') })).toBe(false);
    } finally {
      await close();
    }
  });
});

describe('the probe reads the runner TLS files at every exec', () => {
  const env = {
    STUDIO_RUNNER_TLS_KEY_FILE: fixture('key'),
    STUDIO_RUNNER_TLS_CERT_FILE: fixture('cert'),
    STUDIO_RUNNER_TLS_CA_FILE: fixture('cert'),
  };

  it('returns the three files, and null when any variable is unset, blank or unreadable', () => {
    const tls = readProbeTls(env);
    expect(tls).not.toBeNull();
    expect(Buffer.from(tls?.cert ?? '').equals(testTls.cert)).toBe(true);
    expect(readProbeTls({})).toBeNull();
    for (const name of Object.keys(env)) {
      expect(readProbeTls({ ...env, [name]: undefined })).toBeNull();
      expect(readProbeTls({ ...env, [name]: '' })).toBeNull();
      expect(readProbeTls({ ...env, [name]: '/nonexistent/probe-material' })).toBeNull();
    }
  });
});
