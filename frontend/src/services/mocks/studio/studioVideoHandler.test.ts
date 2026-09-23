import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { studioMockServer } from './server';
import { resetStudioMocks } from './handlers';
import { MOCK_READABLE_CSIS, MOCK_VIDEO_BYTES, OTHER_CSI, mockExecutions } from './fixtures';

/**
 * Story 10.16a — **AC-13**, the byte half. The body-shape half, which needs the document's
 * `ErrorResponse`, is in `studioContract.test.ts` with the Ajv harness that already lives there.
 *
 * Every expected length below is read from {@link MOCK_VIDEO_BYTES} in this file, so a handler that
 * hard-codes `200` or transcribes a length fails one of the two range tests.
 */

const ORIGIN = 'http://localhost';

beforeAll(() => studioMockServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  studioMockServer.resetHandlers();
  resetStudioMocks();
});
afterAll(() => studioMockServer.close());

const readableWith = (status: string) =>
  mockExecutions.find(
    (execution) =>
      execution.video.status === status &&
      execution.csiId !== null &&
      MOCK_READABLE_CSIS.includes(execution.csiId),
  )!;

const available = readableWith('AVAILABLE');
const expired = readableWith('EXPIRED');
const SIZE = MOCK_VIDEO_BYTES.length;

function requestVideo(executionId: string, init?: { range?: string; query?: string }) {
  const headers: Record<string, string> = init?.range ? { Range: init.range } : {};
  return fetch(
    `${ORIGIN}/api/v1/studio/executions/${executionId}/video${init?.query ?? ''}`,
    { headers },
  );
}

describe('the mock video route serves bytes as the document declares (AC-13)', () => {
  it('the fixture is a non-trivial EBML/WebM body large enough for playback and range cases', () => {
    expect(available).toBeDefined();
    expect(expired).toBeDefined();
    expect(SIZE).toBeGreaterThan(1_000);
    expect(Array.from(MOCK_VIDEO_BYTES.slice(0, 4))).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  });

  it('200 carries the whole fixture, with its length computed from the fixture', async () => {
    const response = await requestVideo(available.executionId);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('video/webm');
    expect(response.headers.get('content-length')).toBe(String(SIZE));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(MOCK_VIDEO_BYTES);
  });

  it('206 for bytes=0-9 carries exactly ten bytes and Content-Length: 10', async () => {
    const response = await requestVideo(available.executionId, { range: 'bytes=0-9' });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-length')).toBe('10');
    expect(response.headers.get('content-range')).toBe(`bytes 0-9/${SIZE}`);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(MOCK_VIDEO_BYTES.slice(0, 10));
  });

  it('206 for an open-ended range ends at the last byte of the fixture', async () => {
    const response = await requestVideo(available.executionId, { range: `bytes=${SIZE - 4}-` });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(`bytes ${SIZE - 4}-${SIZE - 1}/${SIZE}`);
    expect(response.headers.get('content-length')).toBe('4');
  });

  it('206 for a suffix range serves the last n bytes', async () => {
    const response = await requestVideo(available.executionId, { range: 'bytes=-3' });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(`bytes ${SIZE - 3}-${SIZE - 1}/${SIZE}`);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(MOCK_VIDEO_BYTES.slice(SIZE - 3));
  });

  it('416 for a range that starts past the end, with bytes */S carrying the real size', async () => {
    const response = await requestVideo(available.executionId, { range: `bytes=${SIZE}-` });
    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe(`bytes */${SIZE}`);

    const further = await requestVideo(available.executionId, { range: `bytes=${SIZE + 50}-${SIZE + 60}` });
    expect(further.status).toBe(416);
    expect(further.headers.get('content-range')).toBe(`bytes */${SIZE}`);
  });

  it('?download=true serves the same bytes with a server-supplied attachment filename', async () => {
    const response = await requestVideo(available.executionId, { query: '?download=true' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="[^"]+\.webm"$/u);
    const plain = await requestVideo(available.executionId);
    expect(plain.headers.get('content-disposition')).toBeNull();
  });

  it('410 is keyed off the execution’s own EXPIRED status and quotes its expiresAt', async () => {
    const response = await requestVideo(expired.executionId);
    expect(response.status).toBe(410);
    const body = await response.json();
    expect(body.error).toBe('VIDEO_EXPIRED');
    expect(body.message).toContain(expired.video.expiresAt!);
  });

  it('404 for every readable execution whose evidence is neither AVAILABLE nor EXPIRED', async () => {
    const others = mockExecutions.filter(
      (execution) =>
        execution.video.status !== 'AVAILABLE' &&
        execution.video.status !== 'EXPIRED' &&
        MOCK_READABLE_CSIS.includes(execution.csiId!),
    );
    expect(new Set(others.map((execution) => execution.video.status))).toEqual(
      new Set(['PROCESSING', 'FAILED', 'UNAVAILABLE']),
    );
    for (const execution of others) {
      const response = await requestVideo(execution.executionId, { range: 'bytes=0-9' });
      expect(response.status, execution.executionId).toBe(404);
    }
  });

  it('another CSI’s execution is the declared 403, never its bytes', async () => {
    const foreign = mockExecutions.find((execution) => execution.csiId === OTHER_CSI)!;
    const response = await requestVideo(foreign.executionId);
    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toMatch(/application\/json/u);
  });
});
