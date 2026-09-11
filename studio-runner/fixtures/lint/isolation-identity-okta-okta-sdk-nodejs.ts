// Deliberate violation: identity client import must trip no-restricted-imports (AC-22b).
// Not compiled and not linted with the package; test/lint-boundary.test.ts lints it directly.
import '@okta/okta-sdk-nodejs';
