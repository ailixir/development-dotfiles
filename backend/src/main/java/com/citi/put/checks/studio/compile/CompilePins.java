package com.citi.put.checks.studio.compile;

/**
 * Versions this backend pins for compilation (Story 10.8, AC-8; architecture &sect;4.3).
 *
 * <p>Each value here is <em>the</em> value, held once. {@code SYNTAX_REFERENCE_VERSION} is a second
 * copy of a number whose source of truth is {@code studio-runner/src/versions.ts}, so it is
 * drift-guarded by {@code SyntaxReferenceDriftTest} on the {@code ArtifactSchemaDriftTest} pattern:
 * a disagreement fails the build rather than producing artifacts compiled against a reference the
 * runner no longer implements.
 *
 * <p>{@code PROMPT_VERSION} has no other source — 10.5 requires the field on every {@link
 * com.citi.put.checks.studio.compile.gateway.CompileRequest} and nothing fixed its value. It is
 * pinned here, recorded in revision provenance (&sect;8.1) and bumped deliberately whenever the
 * prompt text, the fencing rule or the output contract changes; a model changing must never rewrite
 * an existing revision (&sect;4.6).
 */
public final class CompilePins {

  /**
   * Version of the pinned Playwright syntax reference handed to the gateway.
   *
   * <p>Must equal {@code SYNTAX_REFERENCE_VERSION} in {@code studio-runner/src/versions.ts}: the
   * runner compares it exactly before launching a browser, so an artifact proposed against a
   * different corpus is refused rather than reinterpreted.
   */
  public static final String SYNTAX_REFERENCE_VERSION = "1.1.0";

  /** Version of the prompt assembly — fencing rule, reference framing and output contract. */
  public static final String PROMPT_VERSION = "1.1.0";

  /**
   * The only artifact schema version this backend can hand to the runner.
   *
   * <p>The frozen {@code artifact.schema.json} constrains {@code version} to {@code integer,
   * minimum 1} so that a future V2 document is still schema-valid. That deliberately leaves {@code
   * version: 2} acceptable to the validator, which is not the same as executable here: nothing
   * downstream understands a V2 artifact. <b>Schema validity is not executability.</b>
   *
   * <p>It lives on this class rather than on {@code GatewayResponseParser} for a structural reason.
   * Four consumers need it — the defensive parser, the pipeline's re-assertion, the candidate's
   * {@code artifact_schema_version} column and the readiness gate's term 6 — and the last of those
   * lives outside {@code ..studio.compile}, which may not reference the gateway package at all
   * (AC-28a). A constant on the gateway would have forced either a second literal or a forbidden
   * import. {@code GatewayResponseParser.SUPPORTED_ARTIFACT_VERSION} remains as an alias of this
   * value, never a second decision.
   */
  public static final int SUPPORTED_ARTIFACT_VERSION = 1;

  /** Classpath location of the syntax reference body sent to the gateway. */
  public static final String SYNTAX_REFERENCE_RESOURCE = "studio/syntax-reference.md";

  /** Classpath location of the output/allowed-language contract sent to the gateway. */
  public static final String OUTPUT_CONTRACT_RESOURCE = "studio/output-contract.md";

  /**
   * Marker the syntax reference body carries so the resource and this constant cannot drift apart
   * silently. Asserted by {@code SyntaxReferenceDriftTest}.
   */
  public static final String VERSION_MARKER_PREFIX = "<!-- syntaxReferenceVersion: ";

  private CompilePins() {}
}
