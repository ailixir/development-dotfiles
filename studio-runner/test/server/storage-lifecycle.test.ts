import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApplication } from '../../src/server/application.js';
import { loadConfig } from '../../src/server/config.js';
import { createLocalObjectStore } from '../../src/run/objectStore.js';
import { testFingerprint, testTls } from '../helpers/guidedTls.js';
import { createFakeBrowserLauncher } from '../helpers/runner.js';

describe('local evidence survives the runner lifecycle', () => {
  it('startup and shutdown clear scratch but preserve stored video and manifest', async () => {
    const root = await mkdtemp(join(tmpdir(), 'studio-storage-lifecycle-'));
    const scratch = join(root, 'scratch');
    const objects = join(root, 'objects');
    await mkdir(scratch);
    await writeFile(join(scratch, 'abandoned.tmp'), 'scratch');
    const writer = createLocalObjectStore({ root: objects });
    await writer.put({ key: 'studio/video.webm', contentType: 'video/webm', body: { kind: 'bytes', data: new Uint8Array([10, 20, 30]) } });
    await writer.put({ key: 'studio/result.json', contentType: 'application/json', body: { kind: 'bytes', data: new TextEncoder().encode('{"outcome":"PASSED"}') } });
    const config = loadConfig({
      STUDIO_RUNNER_PORT: '0', STUDIO_RUNNER_HOST: '127.0.0.1',
      STUDIO_RUNNER_SERVICE_IDENTITY: 'test-service', STUDIO_RUNNER_CALLBACK_IDENTITY: 'test-callback',
      STUDIO_RUNNER_CALLBACK_BASE_URL: 'http://127.0.0.1:8080',
      STUDIO_RUNNER_SCRATCH_DIR: scratch, STUDIO_RUNNER_OBJECT_STORE_DIR: objects,
    });
    const app = createApplication(config, { listener: { tls: testTls, controllerCertificateFingerprint256: testFingerprint }, launcher: createFakeBrowserLauncher(), runtimeVersions: {}, logSink: { write: () => undefined } });
    let started = false;
    try {
      await app.start();
      started = true;
      await expect(readFile(join(scratch, 'abandoned.tmp'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect([...await readFile(join(objects, 'studio/video.webm'))]).toEqual([10, 20, 30]);
      await app.drain();
      started = false;
      expect(await readFile(join(objects, 'studio/result.json'), 'utf8')).toBe('{"outcome":"PASSED"}');
    } finally {
      if (started) await app.drain();
      await rm(root, { recursive: true, force: true });
    }
  });
});
