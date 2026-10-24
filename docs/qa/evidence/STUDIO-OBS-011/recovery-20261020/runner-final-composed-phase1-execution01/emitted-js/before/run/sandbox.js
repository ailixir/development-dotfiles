/**
 * Sandbox policy (AC-6a, architecture §9.3, ADR-001 §8).
 *
 * `chromiumSandbox: true` is written in `src/run/browser.ts` and nowhere is it written `false`.
 * There is no configuration key, no environment variable, no job field and no code path that can
 * turn it off, which is why this module holds a *classifier* and not a switch: the only decision
 * left is which failure to report, never whether to try again without the sandbox.
 *
 * §9.3 is explicit — *"prove sandbox startup in staging; do not disable it silently to make the
 * image run"* — and Playwright's own default is the wrong way round (`chromiumSandbox` defaults
 * to `false`, which adds `--no-sandbox`). A reviewer cannot see an option that was never written,
 * so the requirement is enforced as a gate: `test/run/sandbox.test.ts` asserts the positive (the
 * option is `true`) and the negative (no disabling flag appears anywhere under `studio-runner/`,
 * including inside a string, an args array or the `Dockerfile`), and a lint fixture proves the
 * rule fires.
 */
/** The three flags that disable a Chromium sandbox. Assembled, never written out, so that the */
/** repo-wide gate in `test/run/sandbox.test.ts` does not trip over its own needle. */
export const SANDBOX_DISABLING_FLAG_SUFFIXES = [
    '-sandbox',
    '-setuid-sandbox',
    '-gpu-sandbox',
];
/**
 * Recognises the "Chromium could not start with its sandbox" family.
 *
 * Matched on the message, because that is the only signal the browser library surfaces. A false
 * negative costs the generic launch code; it never costs a relaunch without the sandbox, because
 * no such relaunch exists.
 */
export function isSandboxFailure(message) {
    const lowered = message.toLowerCase();
    return (lowered.includes('sandbox') ||
        lowered.includes('operation not permitted') ||
        lowered.includes('setuid'));
}
//# sourceMappingURL=sandbox.js.map