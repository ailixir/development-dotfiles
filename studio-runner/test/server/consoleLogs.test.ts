/**
 * Page console entries on the reported run log: the coordinator redacts each message with this job's own values and
 * appends it through `snapshot.appendLog`, so it rides on the FINAL body like every other log entry.
 */
import { afterEach, describe, expect, it } from 'vitest';

import type { ReportBody } from '../../src/reporting/snapshot.js';
import { createHarness, SERVICE_TOKEN, until } from '../helpers/harness.js';
import type { Harness } from '../helpers/harness.js';
import { createFakeBrowserLauncher, OBSERVED_INPUT_VALUES, observedBody, post } from '../helpers/runner.js';

let harness: Harness | null = null;

afterEach(async () => {
  await harness?.stop();
  harness = null;
});

describe('console entries reach the reported logs', () => {
  it('appends them with their level and timeline position, redacting this job’s input values', async () => {
    const value = OBSERVED_INPUT_VALUES[0];
    if (value === undefined) throw new Error('the fixture job carries no non-secret input value');
    const launcher = createFakeBrowserLauncher();
    launcher.script = {
      console: [
        { level: 'error', message: 'console.error: hello', stepIndex: 0, atMs: 12 },
        { level: 'warn', message: 'console.warn: deprecated', stepIndex: 0, atMs: 13 },
        { level: 'error', message: `page error: failed for ${value}`, stepIndex: 0, atMs: 14 },
      ],
    };
    harness = createHarness({ launcher });
    await harness.start();
    expect((await post(harness.port, '/v2/runs', observedBody(), SERVICE_TOKEN)).status).toBe(202);
    await until(() => harness?.app.coordinator.inFlight === 0);
    const final = JSON.parse(harness.http.reportRequests.at(-1)?.body ?? '') as ReportBody;

    const logs = final.logs.filter((entry) => entry.message.startsWith('console.') || entry.message.startsWith('page error:'));
    expect(logs.map(({ atMs, level, message }) => ({ atMs, level, message }))).toEqual([
      { atMs: 12, level: 'error', message: 'console.error: hello' },
      { atMs: 13, level: 'warn', message: 'console.warn: deprecated' },
      { atMs: 14, level: 'error', message: 'page error: failed for [REDACTED]' },
    ]);
    expect(JSON.stringify(final)).not.toContain(`failed for ${value}`);
  });
});
