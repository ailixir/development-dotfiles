import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BOUNDS,
  DIAGNOSTIC_CODES,
  EMPTY_REFERENCES,
  isDiagnosticCode,
  resolvePolicy,
  validateArtifact,
} from '../src/validator/index.js';
import { artifactByteLength } from '../src/validator/schema.js';
import { findUnsafeRegexConstruct } from '../src/validator/arguments.js';
import { extractSourceTokens } from '../src/validator/references.js';
import { VALIDATOR_PARSER, VALIDATOR_SCHEMA_VERSION, EXECUTOR_VERSION } from '../src/versions.js';

const SOURCE = ['Go to "https://example.com/"'];
const ARTIFACT = {
  version: 1,
  steps: [
    {
      stepIndex: 0,
      originalText: SOURCE[0],
      code: "await page.goto('https://example.com/');",
    },
  ],
};

describe('validateArtifact', () => {
  it('returns typed operations rather than code (AC-11)', () => {
    const result = validateArtifact(ARTIFACT, SOURCE, EMPTY_REFERENCES);
    expect(result.ok).toBe(true);
    expect(result.validatorSchemaVersion).toBe(VALIDATOR_SCHEMA_VERSION);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.operations).toEqual([
      { op: 'goto', url: { kind: 'literal', value: 'https://example.com/' } },
    ]);
    expect(JSON.stringify(result.steps[0]?.operations)).not.toContain('await');
  });

  it('is pure: the same input yields a deeply equal result', () => {
    const first = validateArtifact(ARTIFACT, SOURCE, EMPTY_REFERENCES);
    const second = validateArtifact(ARTIFACT, SOURCE, EMPTY_REFERENCES);
    expect(second).toEqual(first);
  });

  it('honours overridden bounds (AC-10)', () => {
    const permissive = validateArtifact(ARTIFACT, SOURCE, EMPTY_REFERENCES);
    expect(permissive.ok).toBe(true);

    const strict = validateArtifact(ARTIFACT, SOURCE, EMPTY_REFERENCES, {
      bounds: { maxUrlLength: 4 },
    });
    expect(strict.ok).toBe(false);
    expect(strict.steps[0]?.diagnostics.map((d) => d.code)).toContain('ARGUMENT_TOO_LONG');
  });

  it('reports an empty step list when the envelope is unusable', () => {
    const result = validateArtifact(null, [], EMPTY_REFERENCES);
    expect(result.ok).toBe(false);
    expect(result.steps).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe('ARTIFACT_NOT_OBJECT');
    expect(result.diagnostics[0]?.stepIndex).toBeNull();
  });

  it('rejects an empty step body', () => {
    const result = validateArtifact(
      { version: 1, steps: [{ stepIndex: 0, originalText: SOURCE[0], code: '   ' }] },
      SOURCE,
      EMPTY_REFERENCES,
    );
    expect(result.ok).toBe(false);
    expect(result.steps[0]?.diagnostics.map((d) => d.code)).toContain('STATEMENT_NOT_EXPRESSION');
  });

  it('accepts a step with several permitted statements', () => {
    const source = ['Go to the login page and wait for it'];
    const result = validateArtifact(
      {
        version: 1,
        steps: [
          {
            stepIndex: 0,
            originalText: source[0],
            code:
              "await page.goto('https://example.com/login'); await page.waitForURL('https://example.com/login');",
          },
        ],
      },
      source,
      EMPTY_REFERENCES,
    );
    expect(result.ok).toBe(true);
    expect(result.steps[0]?.operations).toHaveLength(2);
  });
});

describe('policy resolution', () => {
  it('merges overrides over the documented defaults', () => {
    expect(resolvePolicy().bounds).toEqual(DEFAULT_BOUNDS);
    expect(resolvePolicy({ bounds: { maxSteps: 3 } }).bounds.maxSteps).toBe(3);
    expect(resolvePolicy({ bounds: { maxSteps: 3 } }).bounds.maxAstDepth).toBe(
      DEFAULT_BOUNDS.maxAstDepth,
    );
    expect(resolvePolicy({}).bounds).toEqual(DEFAULT_BOUNDS);
  });
});

describe('artifact size measurement', () => {
  it('measures UTF-8 bytes', () => {
    expect(artifactByteLength({ a: 'é' })).toBe(new TextEncoder().encode('{"a":"é"}').length);
  });

  it('treats unserializable input as over budget', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(artifactByteLength(cyclic)).toBe(Number.POSITIVE_INFINITY);
    expect(artifactByteLength(undefined)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('regex safety scanner', () => {
  it.each([
    ['(a+)+', 'nesting'],
    ['(a)\\1', 'backreferences'],
    ['\\k<name>', 'named backreferences'],
    ['(?<=a)b', 'lookbehind'],
    ['a)b', 'unbalanced'],
    ['(ab', 'unbalanced'],
  ])('rejects %s', (source, expected) => {
    expect(findUnsafeRegexConstruct(source, 1)).toContain(expected);
  });

  it.each(['dashboard', '^https://example\\.com/[a-z]+$', '(ab)+', '[()]+'])(
    'accepts %s',
    (source) => {
      expect(findUnsafeRegexConstruct(source, 1)).toBeNull();
    },
  );

  it('rejects every quantifier when nesting is configured to zero', () => {
    expect(findUnsafeRegexConstruct('a+', 0)).toContain('quantifiers');
  });
});

describe('source reference tokens', () => {
  it('extracts both token kinds', () => {
    const tokens = extractSourceTokens('Type "<secret LOGIN_PW>" as <var USERNAME> twice <var USERNAME>');
    expect([...tokens.secrets]).toEqual(['LOGIN_PW']);
    expect([...tokens.variables]).toEqual(['USERNAME']);
  });

  it('returns empty sets for a plain line', () => {
    const tokens = extractSourceTokens('Click the button');
    expect(tokens.secrets.size).toBe(0);
    expect(tokens.variables.size).toBe(0);
  });
});

describe('versions (AC-16)', () => {
  it('exports semantic versions', () => {
    expect(VALIDATOR_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(EXECUTOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/u);
  });

  it('names the pinned parser', () => {
    expect(VALIDATOR_PARSER.name).toBe('typescript');
    expect(VALIDATOR_PARSER.version).toMatch(/^\d+\.\d+\.\d+$/u);
  });
});

describe('diagnostic codes', () => {
  it('are unique', () => {
    expect(new Set(DIAGNOSTIC_CODES).size).toBe(DIAGNOSTIC_CODES.length);
  });

  it('are recognised by the guard', () => {
    expect(isDiagnosticCode('ARTIFACT_NOT_OBJECT')).toBe(true);
    expect(isDiagnosticCode('NOT_A_REAL_CODE')).toBe(false);
  });
});
