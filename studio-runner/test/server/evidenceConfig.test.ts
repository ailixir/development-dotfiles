/** STUDIO-OBS-013: the guided worker reads the evidence keys through the one fail-closed loader. */
import { describe, expect, it } from 'vitest';
import { ConfigurationError, CONFIG_PREFIX, EVIDENCE_CONFIG_KEYS, loadConfig, loadEvidenceConfig } from '../../src/server/config.js';

const P = CONFIG_PREFIX;
describe('loadEvidenceConfig', () => {
  it('returns the replay defaults for every evidence key without requiring replay-only identities', () => {
    const evidence = loadEvidenceConfig({});
    const replay = loadConfig({ [`${P}SERVICE_IDENTITY`]: 's', [`${P}CALLBACK_IDENTITY`]: 'c', [`${P}CALLBACK_BASE_URL`]: 'https://backend.test' });
    expect(Object.keys(evidence)).toHaveLength(EVIDENCE_CONFIG_KEYS.length);
    for (const [field, value] of Object.entries(evidence)) expect(replay[field as keyof typeof replay]).toEqual(value);
    expect(evidence).toMatchObject({ objectStoreProvider: 'filesystem', recordingWidth: 1280, recordingHeight: 720, seekOriginCalibrationMs: 0, objectStoreMaxAttempts: 3, objectStoreWindowMs: 15_000 });
  });
  it('reads configured values with the same specs', () => {
    expect(loadEvidenceConfig({ [`${P}RECORDING_WIDTH`]: '800', [`${P}OBJECT_STORE_PROVIDER`]: 's3', [`${P}OBJECT_STORE_BUCKET`]: 'b', [`${P}OBJECT_STORE_REGION`]: 'r', [`${P}OBJECT_STORE_FORCE_PATH_STYLE`]: 'true' }))
      .toMatchObject({ recordingWidth: 800, objectStoreProvider: 's3', objectStoreBucket: 'b', objectStoreForcePathStyle: true });
  });
  it.each([
    [{ [`${P}NOT_A_KEY`]: 'x' }, 'is not a configuration key'],
    [{ [`${P}OBJECT_STORE_PROVIDER`]: 'ftp' }, 'must be filesystem or s3'],
    [{ [`${P}OBJECT_STORE_PROVIDER`]: 's3' }, 'S3 requires'],
    [{ [`${P}OBJECT_STORE_PROVIDER`]: 's3', [`${P}OBJECT_STORE_BUCKET`]: 'b', [`${P}OBJECT_STORE_REGION`]: 'r', [`${P}OBJECT_STORE_ENDPOINT`]: 'http://sonic.example' }, 'must use https'],
    [{ [`${P}SCRATCH_DIR`]: '/tmp/shared', [`${P}OBJECT_STORE_DIR`]: '/tmp/shared/objects' }, 'must be disjoint'],
    [{ [`${P}RECORDING_HEIGHT`]: '0' }, 'must be >= 1'],
  ])('refuses %j fail closed', (env, problem) => {
    expect(() => loadEvidenceConfig(env)).toThrow(ConfigurationError);
    expect(() => loadEvidenceConfig(env)).toThrow(problem);
  });
});
