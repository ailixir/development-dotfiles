import { describe, expect, it } from 'vitest';
import {
  adaptLegacyStudioAuthoring,
  isAuthoringV2Request,
  parseStudioAuthoring,
  validateStudioAuthoring,
} from './legacyStudioAuthoringAdapter';

const IDS = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
];

describe('legacy Studio authoring adapter', () => {
  it('preserves every source string exactly and supplies no context', () => {
    const source = ['', '  Café 東京 "quoted" C:\\tmp\\file\nsecond line  '];
    let next = 0;

    const adapted = adaptLegacyStudioAuthoring({ steps: source }, () => IDS[next++]);

    expect(adapted).toEqual({
      authoringSchemaVersion: 2,
      steps: [
        { id: IDS[0], text: source[0] },
        { id: IDS[1], text: source[1] },
      ],
    });
    expect(adapted.steps.map((step) => step.text)).toEqual(source);
    expect(adapted.steps.every((step) => !('context' in step))).toBe(true);
    expect('globalContext' in adapted).toBe(false);
  });

  it('gets fresh IDs from the factory without deriving them from array positions', () => {
    const calls: unknown[][] = [];
    let next = 0;
    const adapted = adaptLegacyStudioAuthoring({ steps: ['same', 'same'] }, (...args: unknown[]) => {
      calls.push(args);
      return IDS[next++];
    });

    expect(calls).toEqual([[], []]);
    expect(adapted.steps.map(({ id }) => id)).toEqual(IDS);
  });

  it('rejects a factory that repeats an ID', () => {
    expect(() => adaptLegacyStudioAuthoring({ steps: ['a', 'b'] }, () => IDS[0])).toThrow(
      'fresh UUID',
    );
  });

  it('adapts legacy input and passes valid v2 input through without cloning or rewriting it', () => {
    const v2 = { authoringSchemaVersion: 2 as const, steps: [{ id: IDS[0], text: ' x ' }] };
    const parsedV2 = parseStudioAuthoring(v2);
    const parsedLegacy = parseStudioAuthoring({ steps: [' x '] }, () => IDS[0]);

    expect(parsedV2).toEqual({ ok: true, value: v2 });
    expect(parsedLegacy).toEqual({
      ok: true,
      value: { authoringSchemaVersion: 2, steps: [{ id: IDS[0], text: ' x ' }] },
    });
    expect(isAuthoringV2Request(v2)).toBe(true);
  });

  it('rejects mixed, duplicate and orphan identity combinations', () => {
    expect(
      validateStudioAuthoring({
        authoringSchemaVersion: 2,
        steps: ['legacy', { id: IDS[0], text: 'v2' }],
      }).map(({ category }) => category),
    ).toContain('MIXED_STEP_SHAPES');

    expect(
      validateStudioAuthoring({
        authoringSchemaVersion: 2,
        steps: [
          { id: IDS[0], text: 'one' },
          { id: IDS[0], text: 'two' },
        ],
      }).map(({ category }) => category),
    ).toContain('DUPLICATE_STEP_ID');
  });
});
