/**
 * AC-3 — no generated source crosses into the browser process.
 *
 * The parent→child boundary carries the validated operation list as **data only**: no artifact
 * source text, no code string, no serialized function. The child's accepted message schema is
 * default-deny on keys, and a message carrying a source field is refused by name.
 *
 * The scan half of AC-3 — `no-eval`/`no-new-func`/`vm`/`worker_threads` and the emitted-package
 * grep now covering `src/run/**` — lives in `test/no-dynamic-evaluation.test.ts` (which reads the
 * whole of `dist/`) and `test/lint-boundary.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  PROTOCOL_CODES,
  PROTOCOL_VERSION,
  SOURCE_SHAPED_KEYS,
  parseChildMessage,
  parseExecuteMessage,
  parseLaunchMessage,
} from '../../src/run/protocol.js';

function validLaunch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'launch',
    protocolVersion: PROTOCOL_VERSION,
    runId: 'run-1',
    browser: 'chromium',
    viewport: { width: 1280, height: 720 },
    recording: { width: 1280, height: 720 },
    scratchPath: '/scratch/run-1',
    totalRuntimeMs: 120_000,
    ...overrides,
  };
}

function validExecute(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'execute',
    protocolVersion: PROTOCOL_VERSION,
    stepTimeoutMs: 30_000,
    steps: [
      {
        stepIndex: 0,
        operations: [{ op: 'goto', url: { kind: 'literal', value: 'https://local/' } }],
      },
    ],
    variables: {},
    secrets: { PW: 'canary' },
    maxFailureMessageLength: 400,
    ...overrides,
  };
}

describe('the boundary accepts the validated operation list, as data', () => {
  it('accepts a well-formed launch message', () => {
    expect(parseLaunchMessage(validLaunch()).ok).toBe(true);
  });

  it('accepts a well-formed execute message carrying operations and resolved values', () => {
    const parsed = parseExecuteMessage(validExecute());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.message.steps[0]?.operations).toHaveLength(1);
    expect(parsed.message.secrets.PW).toBe('canary');
  });
});

describe('AC-3 — a message carrying a source field is refused', () => {
  it.each(SOURCE_SHAPED_KEYS.map((key) => [key] as const))(
    'refuses a top-level %s by name',
    (key) => {
      const parsed = parseExecuteMessage(validExecute({ [key]: 'await page.goto("x")' }));
      expect(parsed.ok).toBe(false);
      if (parsed.ok) return;
      expect(parsed.problems).toContainEqual({
        code: PROTOCOL_CODES.sourceNotPermitted,
        field: key,
      });
    },
  );

  it('refuses a source field hidden on a step', () => {
    const parsed = parseExecuteMessage(
      validExecute({
        steps: [
          {
            stepIndex: 0,
            operations: [],
            code: "await page.goto('https://elsewhere.example/');",
          },
        ],
      }),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems.map((problem) => problem.field)).toContain('steps[0].code');
  });

  it('refuses the artifact itself, which is the thing that must never cross', () => {
    const parsed = parseExecuteMessage(
      validExecute({ artifact: { version: 1, steps: [{ code: 'x' }] } }),
    );
    expect(parsed.ok).toBe(false);
  });

  it('refuses the launch message too, so the guard is not one message wide', () => {
    const parsed = parseLaunchMessage(validLaunch({ source: ['Go to the login page'] }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems[0]?.code).toBe(PROTOCOL_CODES.sourceNotPermitted);
  });
});

describe('default-deny on keys, the same posture the validator and the envelope take', () => {
  it('refuses a key nobody enumerated', () => {
    const parsed = parseExecuteMessage(validExecute({ somethingNobodyPredicted: true }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems).toContainEqual({
      code: PROTOCOL_CODES.unknownKey,
      field: 'somethingNobodyPredicted',
    });
  });

  it('never reports a value, only a key name', () => {
    const parsed = parseExecuteMessage(validExecute({ smuggled: 'canary-secret-value' }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(JSON.stringify(parsed.problems)).not.toContain('canary-secret-value');
  });

  it('refuses a protocol version it does not implement', () => {
    for (const parse of [parseLaunchMessage, parseExecuteMessage]) {
      const message = parse === parseLaunchMessage ? validLaunch() : validExecute();
      const parsed = parse({ ...message, protocolVersion: PROTOCOL_VERSION + 1 });
      expect(parsed.ok).toBe(false);
      if (parsed.ok) continue;
      expect(parsed.problems[0]?.code).toBe(PROTOCOL_CODES.versionMismatch);
    }
  });

  it('refuses a non-object and a wrong kind', () => {
    expect(parseExecuteMessage('await page.goto("x")').ok).toBe(false);
    expect(parseExecuteMessage(null).ok).toBe(false);
    expect(parseLaunchMessage(validLaunch({ kind: 'execute' })).ok).toBe(false);
  });

  it('reports every problem, not just the first', () => {
    const parsed = parseExecuteMessage({ kind: 'execute', protocolVersion: 99, source: 'x' });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.problems.length).toBeGreaterThan(2);
  });

  it('refuses malformed fields rather than defaulting them', () => {
    expect(parseLaunchMessage(validLaunch({ viewport: { width: 0, height: 720 } })).ok).toBe(false);
    expect(parseLaunchMessage(validLaunch({ scratchPath: '' })).ok).toBe(false);
    expect(parseLaunchMessage(validLaunch({ totalRuntimeMs: -1 })).ok).toBe(false);
    expect(parseExecuteMessage(validExecute({ steps: 'all of them' })).ok).toBe(false);
    expect(parseExecuteMessage(validExecute({ steps: ['not an object'] })).ok).toBe(false);
    expect(parseExecuteMessage(validExecute({ secrets: { PW: 7 } })).ok).toBe(false);
    expect(parseExecuteMessage(validExecute({ stepTimeoutMs: 0 })).ok).toBe(false);
    expect(
      parseExecuteMessage(validExecute({ steps: [{ stepIndex: 'first', operations: [] }] })).ok,
    ).toBe(false);
  });
});

describe('the parent reads only what it recognises', () => {
  it('accepts the four child message kinds', () => {
    expect(
      parseChildMessage({ kind: 'ready', browserStartedAt: '2026-09-11T10:00:00.000Z', startedAtMs: 0 }),
    ).not.toBeNull();
    expect(parseChildMessage({ kind: 'step-started', stepIndex: 0, startedAtMs: 1.5 })).not.toBeNull();
    expect(parseChildMessage({ kind: 'step-finished', stepIndex: 0, status: 'PASS' })).not.toBeNull();
    expect(parseChildMessage({ kind: 'result', ok: true })).not.toBeNull();
  });

  it('drops anything else rather than guessing at it', () => {
    expect(parseChildMessage({ kind: 'ready', browserStartedAt: 7, startedAtMs: 0 })).toBeNull();
    expect(parseChildMessage({ kind: 'step-started', stepIndex: 'x', startedAtMs: 0 })).toBeNull();
    expect(parseChildMessage({ kind: 'step-finished', stepIndex: 0 })).toBeNull();
    expect(parseChildMessage({ kind: 'result' })).toBeNull();
    expect(parseChildMessage({ kind: 'evaluate', code: 'x' })).toBeNull();
    expect(parseChildMessage('ready')).toBeNull();
    expect(parseChildMessage(null)).toBeNull();
  });
});
