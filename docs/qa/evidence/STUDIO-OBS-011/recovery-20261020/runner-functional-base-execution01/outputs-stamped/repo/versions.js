/**
 * The one observed contract generation (ADR-SC-005, STUDIO-OBS-012A): `contracts/v3`. The
 * executable pins (artifact, policy, executor, validator, protocol, profile catalog) are not
 * restated here; they are the `const`s of the generated v3 schemas (`OBSERVED_PROFILE` in
 * `validator/observedReferencePolicy.ts`), and build identity is `assertBuild`'s.
 *
 * The artifact-1 stamps this module used to declare (artifact envelope, validator schema,
 * executor, syntax reference and parser versions) were retired by STUDIO-OBS-009 AC-1 P2. The
 * runtime record names observed identities only: `scripts/write-runtime-versions.mjs` computes
 * them from the packaged schemas, the reference bundle, the installed browser and the launcher.
 */
export const OBSERVED_CONTRACT_VERSION = 3;
//# sourceMappingURL=versions.js.map