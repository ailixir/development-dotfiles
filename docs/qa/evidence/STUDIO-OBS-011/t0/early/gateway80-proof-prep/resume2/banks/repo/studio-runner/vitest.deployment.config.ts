import { defineConfig } from 'vitest/config';

/**
 * Deployment-evidence tier (story 10.18a; `ci/stages.md` stage 9).
 *
 * **This tier exists because QA found the nineteenth vacuous-guard shape in its first version.**
 * The chart and SEC-2 suites were written with `describe.skipIf(!HELM)` and `it.skipIf(!DOCKER)`,
 * which QA measured rather than argued about: with `helm` off `PATH` the chart file reported
 * *1 passed / 89 skipped* and was **green**; with `STUDIO_RUNNER_IMAGE` pointed at a tag that does
 * not exist, SEC-2 reported *1 passed / 3 skipped in 1 ms* and was **green**. The only surviving
 * assertion was `expect(typeof DOCKER).toBe('boolean')` and the disclosure lived in a test *name*.
 * A name is not a signal a pipeline reads; a green file is. And `ci/stages.md` ran the whole thing
 * in stage 4, which has neither prerequisite — so AC-1 – AC-12 and **AC-4a part 3**, the criterion
 * @po named this story's weakest, had no executable enforcement in CI at all.
 *
 * The shape, stated so it is catalogued rather than re-derived: **unconditional skips were applied
 * to the halves declared blocked, and environment-conditional skips to the halves declared passed.
 * The blocked ones cannot self-arm; the passed ones silently disarm.**
 *
 * Two changes follow, and they are separate:
 *
 * 1. **This tier fails closed.** There is no `skipIf` anywhere in it. `helm` absent, `docker`
 *    absent or the image absent are **failures**, in every test that needs them, with a message
 *    naming the stage that is supposed to provide them. There is deliberately **no opt-out
 *    environment variable**: an opt-out is the hole re-opened under a longer name.
 * 2. **It runs where its prerequisites exist.** `ci/stages.md` stage 9, after the image build
 *    (stage 7) and beside the Helm tooling (stage 8), invoked as `npm run test:deployment` with
 *    `STUDIO_RUNNER_IMAGE` set to the tag stage 7 produced.
 *
 * It is excluded from the default run for the same reason the fixtures tier is: the default run
 * is `npm test` on a plain Node image, and a tier whose prerequisites are an external binary and a
 * built container image does not belong in it. **That exclusion is itself guarded** —
 * `test/deployment-tier-wiring.test.ts` runs in the default tier and reddens if this config, the
 * `test:deployment` script, the stage entry, or any of this tier's files goes missing. Moving a
 * tier out of the default run is exactly how a tier gets quietly lost, so the move is watched.
 *
 * `passWithNoTests` is deliberately NOT set. An empty run here would be a silent pass, and this is
 * the tier that carries the story's security evidence.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/deployment/**/*.test.ts'],
    // `docker run` against a real image, twice, plus a Chromium launch inside it.
    testTimeout: 300_000,
    hookTimeout: 300_000,
    // Each file shells out to `helm` or `docker`; running them at once measures the machine.
    fileParallelism: false,
  },
});
