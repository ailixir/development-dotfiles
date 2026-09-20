// Deliberate violation: a Chromium sandbox-disabling flag hidden in an args array, which is
// exactly the shape architecture §9.3 forbids ("do not disable it silently to make the image
// run"). Asserted by `test/lint-boundary.test.ts`; excluded from the package lint run.
export const launchArgs = ['--disable-gpu', '--no-sandbox'];
