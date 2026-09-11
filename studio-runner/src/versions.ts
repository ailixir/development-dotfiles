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
export const VALIDATOR_SCHEMA_VERSION = '1.0.0';

/** Version of the trusted executor's operation contract. */
export const EXECUTOR_VERSION = '1.0.0';

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
