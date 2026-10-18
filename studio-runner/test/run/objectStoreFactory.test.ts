/** STUDIO-OBS-013: one object-store composition for the replay runner and the guided worker. */
import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConfiguredObjectStore, evidenceBoundsFrom, NODE_EVIDENCE_FILE_SYSTEM } from '../../src/run/objectStoreFactory.js';
import { PERMITTED_OBJECT_STORE_OPERATIONS } from '../../src/run/objectStore.js';
import { loadEvidenceConfig } from '../../src/server/config.js';

describe('createConfiguredObjectStore', () => {
  it('composes the filesystem store from the evidence settings and writes under its root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'factory-objects-'));
    try {
      const configured = createConfiguredObjectStore(loadEvidenceConfig({ STUDIO_RUNNER_OBJECT_STORE_DIR: root }));
      expect(Object.keys(configured.store)).toEqual([...PERMITTED_OBJECT_STORE_OPERATIONS]);
      await configured.store.put({ key: 'studio/CSI-1/guided/s.manifest.json', body: { kind: 'bytes', data: new TextEncoder().encode('{}') }, contentType: 'application/json' });
      expect(await readFile(join(root, 'studio/CSI-1/guided/s.manifest.json'), 'utf8')).toBe('{}');
      expect(() => { configured.close(); }).not.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('composes the S3 client for provider s3 and releases it on close', () => {
    const configured = createConfiguredObjectStore(loadEvidenceConfig({ STUDIO_RUNNER_OBJECT_STORE_PROVIDER: 's3', STUDIO_RUNNER_OBJECT_STORE_BUCKET: 'bucket', STUDIO_RUNNER_OBJECT_STORE_REGION: 'us-east-1', STUDIO_RUNNER_OBJECT_STORE_ENDPOINT: 'https://sonic.example.test' }));
    expect(Object.keys(configured.store)).toEqual([...PERMITTED_OBJECT_STORE_OPERATIONS]);
    expect(() => { configured.close(); }).not.toThrow();
  });
  it('derives the uploader bounds and exposes a stat-only production filesystem port', async () => {
    expect(evidenceBoundsFrom(loadEvidenceConfig({ STUDIO_RUNNER_OBJECT_STORE_MAX_ATTEMPTS: '4' }))).toEqual({ maxAttempts: 4, windowMs: 15_000, backoffMs: 250 });
    const directory = await mkdtemp(join(tmpdir(), 'factory-fs-'));
    try { const path = join(directory, 'f'); await writeFile(path, 'abc'); expect(await NODE_EVIDENCE_FILE_SYSTEM.stat(path)).toEqual({ size: 3 }); expect(Buffer.from(await NODE_EVIDENCE_FILE_SYSTEM.readFile(path)).toString()).toBe('abc'); }
    finally { await rm(directory, { recursive: true, force: true }); }
  });
});
