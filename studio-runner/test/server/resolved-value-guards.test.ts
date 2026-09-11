/**
 * Story 10.17 AC-16a and AC-22 — the two guards that now stand between a **real** value and a
 * surface, re-falsified against real material rather than against a planted constant.
 *
 * Both were already implemented before this story. Neither had ever been exercised with a value
 * behind the reference, because until story 10.17 the API resolved values at dispatch and then
 * threw them away, so no resolved value had ever reached a runner at all. What this file owes is
 * the re-falsification.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { createRedactor } from '../../src/executor/redaction.js';
import { createRunSnapshot } from '../../src/reporting/snapshot.js';
import { DEFAULT_REPORT_BOUNDS } from '../../src/reporting/bounds.js';
import type { LogBuffer } from '../../src/reporting/bounds.js';
import { validateArtifact } from '../../src/validator/index.js';
import { createHarness, SERVICE_TOKEN, until } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { post, validJob } from '../helpers/runner.js';

const SECRET = 'Position-Canary-Real-Value-3f81b0';

let harness: Harness | null = null;

afterEach(async () => {
  await harness?.stop();
  harness = null;
});

// ── AC-16a — the secret-position rule, with a real value behind the reference ──────────────────

/**
 * The four positions §4.5 forbids: *"secret values only in approved action argument
 * positions/destinations, never selectors, URLs, assertions or log messages"*.
 */
const FORBIDDEN_POSITIONS = [
  {
    id: 'a goto URL',
    text: 'Go to "<secret PW>"',
    code: "await page.goto(vars.secret('PW'));",
  },
  {
    id: 'a locator',
    text: 'Click the "<secret PW>" button',
    code: "await page.getByRole('button', { name: vars.secret('PW') }).click();",
  },
  {
    id: 'an assertion argument',
    text: 'Expect the page to contain "<secret PW>"',
    code: "await expect(page.getByTestId('out')).toHaveText(vars.secret('PW'));",
  },
  {
    id: 'an option value',
    text: 'Select "<secret PW>" from the "Region" dropdown',
    code: "await page.getByLabel('Region').selectOption(vars.secret('PW'));",
  },
] as const;

function artifactFor(text: string, code: string): unknown {
  return { version: 1, steps: [{ stepIndex: 0, originalText: text, code }] };
}

describe('AC-16a — a secret in a forbidden position is refused before capacity, with a real value behind it', () => {
  for (const position of FORBIDDEN_POSITIONS) {
    it(`refuses ${position.id} with no capacity taken and no admission`, async () => {
      harness = createHarness();
      await harness.start();

      const response = await post(
        harness.port,
        '/v1/runs',
        JSON.stringify(
          validJob({
            source: [position.text],
            artifact: artifactFor(position.text, position.code),
            references: { variables: [], secrets: ['PW'] },
            resolvedVars: {},
            // The value is genuinely on the job. That is what makes this a re-falsification
            // rather than a repeat of the rule's original unit test.
            resolvedSecrets: { PW: SECRET },
          }),
        ),
        SERVICE_TOKEN,
      );

      expect(response.status).toBe(400);
      expect((JSON.parse(response.body) as { code: string }).code).toBe('ARTIFACT_INVALID');
      expect(harness.app.pool.inUse, 'a refused artifact took a capacity slot').toBe(0);
      expect(harness.http.admissionRequests).toHaveLength(0);
      // And the refusal carries no part of the value it was refusing to place.
      expect(response.body).not.toContain(SECRET);
    });
  }

  it('the experiment is capable of failing: the same secret in a fill value is admitted', async () => {
    // The permit companion. Without it "refuse every secret" would satisfy the four above, which
    // would be a very effective way to pass this criterion and ship nothing.
    harness = createHarness();
    await harness.start();

    const response = await post(
      harness.port,
      '/v1/runs',
      JSON.stringify(validJob({ resolvedSecrets: { PW: SECRET } })),
      SERVICE_TOKEN,
    );

    expect(response.status, 'the approved position must still be approved').toBe(202);
    await until(() => harness !== null && harness.http.admissionRequests.length > 0, 10_000);
  });

  it('re-asserts token correspondence in both directions against the typed declaration', () => {
    const declared = { variables: [], secrets: ['PW'] };

    // A source line naming a reference whose code does not use it.
    const namedNotUsed = validateArtifact(
      artifactFor('Type "<secret PW>" in the password field', "await page.getByTestId('pw').fill('literal');"),
      ['Type "<secret PW>" in the password field'],
      declared,
    );
    expect(namedNotUsed.ok).toBe(false);

    // …and the reverse: code using a reference the source line does not name.
    const usedNotNamed = validateArtifact(
      artifactFor('Type the password', "await page.getByTestId('pw').fill(vars.secret('PW'));"),
      ['Type the password'],
      declared,
    );
    expect(usedNotNamed.ok).toBe(false);

    // …and a reference the typed declaration does not carry at all.
    const undeclared = validateArtifact(
      artifactFor('Type "<secret OTHER>" in the password field', "await page.getByTestId('pw').fill(vars.secret('OTHER'));"),
      ['Type "<secret OTHER>" in the password field'],
      declared,
    );
    expect(undeclared.ok).toBe(false);
    expect(
      undeclared.steps.flatMap((step) => step.diagnostics).map((diagnostic) => diagnostic.code),
    ).toContain('REFERENCE_UNDECLARED');
  });
});

// ── AC-22 (MED-3) — the call-site guard over the truncating log buffer ─────────────────────────

/**
 * `createLogBuffer.append` truncates `entry.message` **before** `reportClient` redacts the
 * assembled body. @qa verified it is a latent trap rather than a live defect: the two producers of
 * that field both resolve to a single site that redacts first. The risk was never today's callers,
 * it was the third one.
 *
 * @po ruled: close it with a **call-site guard, not a restructure**. Reordering inside `bounds.ts`
 * would put a redaction responsibility in a module whose job is bounding, and this codebase has
 * paid three times for two copies of one fact. So the guard is at the boundary — `appendLog` — and
 * it is asserted here on **a planted canary observed on the emitted entry**, not by scanning call
 * sites: a producer that built the same string through an innocently named local would pass a scan.
 */
describe('AC-22 — every producer reaching the bounded log buffer goes through the run’s redactor', () => {
  function snapshotWith(redactorValues: readonly string[]) {
    return createRunSnapshot({
      identity: {
        executionId: 'exec-1',
        attemptId: 'attempt-1',
        admissionId: 'admission-1',
        runnerInstanceId: 'runner-a',
      },
      bounds: DEFAULT_REPORT_BOUNDS,
      runtimeVersions: {},
      wallClock: () => new Date('2026-09-11T10:00:00.000Z'),
      redactor: createRedactor(redactorValues),
    });
  }

  it('scrubs a canary a producer passed raw, observed on the emitted entry', () => {
    const snapshot = snapshotWith([SECRET]);

    // A producer that did not redact first — the third caller, written today.
    snapshot.appendLog({ atMs: null, level: 'error', message: `step 0 FAIL: typed ${SECRET}` });

    const entries = snapshot.build('PROGRESS').logs;
    expect(entries, 'nothing was emitted, so nothing has been shown to be scrubbed').toHaveLength(1);
    expect(entries[0]?.message).not.toContain(SECRET);
    expect(entries[0]?.message).toContain('step 0 FAIL');
  });

  it('scrubs before the truncation that cuts, so a cut cannot free half a value', () => {
    // The hazard sized so it actually occurs: the canary is positioned so the buffer's
    // `slice(0, maxEntryLength - 1)` lands **inside** it. Truncate-first would leave a fragment,
    // and a fragment matches no variant the redactor scrubs.
    const cut = DEFAULT_REPORT_BOUNDS.maxLogEntryLength;
    const lead = 'L'.repeat(cut - Math.floor(SECRET.length / 2));
    const snapshot = snapshotWith([SECRET]);

    snapshot.appendLog({ atMs: null, level: 'error', message: `${lead}${SECRET} trailing` });

    const message = snapshot.build('PROGRESS').logs[0]?.message ?? '';
    expect(message.length, 'the entry was not long enough to be cut').toBeGreaterThan(cut - 5);
    expect(message).not.toContain(SECRET);
    expect(message, 'a fragment of the value survived the truncation').not.toContain(
      SECRET.slice(0, 12),
    );
  });

  it('the experiment is capable of failing: an unrelated value on the same path is not scrubbed', () => {
    // The control. If everything were removed from every entry, the two assertions above would be
    // true for the wrong reason.
    const snapshot = snapshotWith([SECRET]);
    snapshot.appendLog({ atMs: null, level: 'info', message: 'browser started at 127.0.0.1' });
    expect(snapshot.build('PROGRESS').logs[0]?.message).toContain('127.0.0.1');
  });

  /**
   * **QA-1.** The guard, asserted on the production surface rather than on a comment.
   *
   * The version of this test that shipped in `fa7afa55b` was named *"enumerates the producers …
   * and finds one call site"* and enumerated nothing: it re-asserted its sibling's planted-canary
   * property under a structural name, while the structural claim lived only in a prose comment.
   * `RunSnapshot.logs` was the whole `LogBuffer`, so `snapshot.logs.append(...)` reached the
   * truncating buffer directly, around the run's redactor — and AC-22's own stated falsification,
   * *route one existing producer around the redactor*, left the suite at 886 passed.
   *
   * That is the epic's **sixteenth** vacuous-guard shape: *a guard whose name states a structural
   * property of a production symbol while its body asserts over a test-local stand-in.* It survives
   * ordinary mutation testing because a **sibling** mechanism reddens it — M9 broke `appendLog`
   * from the inside, where three other tests watch, so the missing outside guard stayed hidden.
   *
   * The repair is not a better watcher; a test cannot watch a door that is open. `RunSnapshot.logs`
   * is now a read-only {@link LogView} and the buffer lives in the closure, so a producer that goes
   * around `appendLog` **cannot reach the buffer at all**. These assertions are on the production
   * object, and they go red the moment the buffer is handed out whole again.
   */
  it('offers no way into the bounded buffer except appendLog, on the production object (QA-1)', () => {
    const snapshot = snapshotWith([SECRET]);

    // The mutation QA performed, attempted here rather than described. `append` is absent at run
    // time, not merely hidden by a type: `{ ...logs }` or `logs` itself would carry it across and
    // reopen the bypass, so the view forwards reads one by one.
    const asBuffer = snapshot.logs as unknown as Partial<LogBuffer>;
    expect(
      asBuffer.append,
      'RunSnapshot.logs exposes append, so a producer can reach the buffer around the redactor',
    ).toBeUndefined();
    expect(Object.keys(snapshot.logs).sort()).toEqual(['dropped', 'entries', 'truncated']);

    // …and a producer that tries it fails loudly rather than leaking quietly.
    expect(() => {
      (snapshot.logs as unknown as LogBuffer).append({
        atMs: null,
        level: 'error',
        message: `step 0 FAIL: typed ${SECRET}`,
      });
    }).toThrow(TypeError);

    // Nothing reached the buffer, so nothing reaches the body.
    expect(snapshot.build('PROGRESS').logs).toHaveLength(0);
  });

  it('still forwards every read the report builder needs, so the view is not merely a blockade', () => {
    // The control for the assertions above: a view that forwarded nothing would satisfy them and
    // break the product. Reads work; only the write is gone.
    const snapshot = snapshotWith([SECRET]);
    expect(snapshot.logs.entries()).toHaveLength(0);
    expect(snapshot.logs.truncated).toBe(false);
    expect(snapshot.logs.dropped).toBe(0);

    snapshot.appendLog({ atMs: null, level: 'error', message: `recording failed: ${SECRET}` });

    expect(snapshot.logs.entries()).toHaveLength(1);
    expect(snapshot.logs.entries()[0]?.message).not.toContain(SECRET);
    expect(snapshot.build('PROGRESS').logs[0]?.message).not.toContain(SECRET);
  });
});
