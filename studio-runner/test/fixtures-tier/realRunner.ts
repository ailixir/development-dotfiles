/**
 * Shared helpers for the fixtures tier.
 *
 * This module used to drive one real artifact-1 run end to end (`runReal`): real Chromium in a
 * real child process, executing a validated operation list through the Playwright adapter. That
 * run path was deleted by STUDIO-OBS-012A AC-3; the observed suites in this tier launch their own
 * observed children, and what they share is kept here.
 */

/**
 * Waits for a condition, on the **wall clock**.
 *
 * `test/helpers/harness.ts`'s `until` spends a budget of microtask ticks, which is right for the
 * unit tier where nothing sleeps. A real browser takes real time, so this tier needs a real bound.
 */
export async function untilMs(predicate: () => boolean, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error(`Condition was not met within ${String(timeoutMs)}ms.`);
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    });
  }
}
