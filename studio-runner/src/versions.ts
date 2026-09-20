/**
 * Version constants recorded on every validation and execution (architecture §4.3, §4.6).
 *
 * `VALIDATOR_SCHEMA_VERSION` covers the accepted-language schema *and* the parser that reads
 * it: changing either changes what the same artifact means, so both move together. The parser
 * identity is declared separately in `VALIDATOR_PARSER` so `scripts/write-runtime-versions.mjs`
 * can assert it against the exact pin in `package.json`.
 */

/** Artifact envelope version accepted by this validator (architecture §4.4). */
export const ARTIFACT_VERSION = 1;

/** Version of the accepted-language schema + parser pair. */
export const VALIDATOR_SCHEMA_VERSION = '2.0.0';

/** Version of the trusted executor's operation contract. */
export const EXECUTOR_VERSION = '2.0.0';

/**
 * Version of the pinned syntax reference: the corpus in `fixtures/reference/` together with the
 * `fixtures/reference/manifest.json` that binds each example to the permitted methods it
 * demonstrates (architecture §4.3, story 10.3 AC-4).
 *
 * It is recorded on every artifact's provenance and compared exactly by `src/compat/`: the same
 * source compiled against a different reference corpus may have been proposed under a different
 * set of examples, so an artifact is never reinterpreted across a change here. Bump it whenever an
 * example is added, removed or changed.
 */
export const SYNTAX_REFERENCE_VERSION = '2.0.0';

/**
 * Parser backing the validator. Story 10.2 chose the TypeScript compiler API over
 * `@typescript-eslint/typescript-estree`: it is already required to build the package, it
 * needs no extra runtime dependency, and it reports the exact TypeScript syntax kinds the
 * default-deny policy enumerates. `version` must equal the exact `typescript` pin.
 */
export const VALIDATOR_PARSER = {
  name: 'typescript',
  version: '5.9.3',
} as const;
