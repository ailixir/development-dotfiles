import { createServer } from 'node:http';
import { describe, expect, it } from 'vitest';
import { probe } from '../../src/probe.js';

describe('authenticated deployment probes', () => {
  it('sends the configured bearer identity and distinguishes health from readiness', async () => {
    const server = createServer((request, response) => {
      request.resume();
      const authenticated = request.headers.authorization === 'Bearer test-probe-identity';
      response.writeHead(authenticated ? (request.url === '/health' ? 200 : 503) : 401);
      response.end();
    });
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing fixture port');
    try {
      expect(await probe(address.port, '/health', 'test-probe-identity')).toBe(true);
      expect(await probe(address.port, '/ready', 'test-probe-identity')).toBe(false);
      expect(await probe(address.port, '/health', 'wrong-identity')).toBe(false);
      expect(await probe(address.port, '/health', '')).toBe(false);
      expect(await probe(0, '/health', 'test-probe-identity')).toBe(false);
    } finally {
      await new Promise<void>((resolve) => { server.close(() => { resolve(); }); });
    }
    expect(await probe(address.port, '/health', 'test-probe-identity')).toBe(false);
  });
});
