package com.citi.put.checks.studio.dispatch;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The job envelope the dispatcher sends to the runner (§8.4, contract {@code RunJob}).
 *
 * <p><b>Fourteen fields, because the contract closes this body at fourteen.</b> {@code
 * additionalProperties: false} plus fourteen {@code required} names means the runner accepts the
 * body or refuses it; there is no partial credit. Until story 10.17 this record carried eight
 * fields of which four — {@code testId}, {@code csiId}, {@code environment} and {@code
 * callbackBaseUrl} — were not properties of the closed body at all, and ten required fields were
 * absent. Every real dispatch was refused {@code 400 JOB_INVALID} by the runner's {@code
 * validateEnvelope}, which runs as step 1 of {@code submit}, before capacity and before any
 * artifact check, and ended {@code ERROR / DISPATCH_FAILED}. No test in either tree looked.
 *
 * <p>{@code callbackBaseUrl} deserves its own sentence, because it was not merely an extra key.
 * §8.4 makes the callback destination deployment configuration and <em>"never arbitrary
 * job-supplied URL"</em>, and the runner keeps a {@code CALLBACK_SHAPED_KEYS} list whose sole
 * purpose is to refuse that class of key by name with a dedicated code. This API's own dispatcher
 * was tripping the one control the closed key set exists to enforce. The destination is the
 * runner's {@code STUDIO_RUNNER_CALLBACK_BASE_URL} and it is not this body's business.
 *
 * <p>It still carries <b>typed reference declarations</b> — names, never values, for the artifact
 * to name — and it now <em>also</em> carries the two ephemeral resolved maps the contract has
 * declared all along. The javadoc sentence this record used to carry, <em>"It carries declared
 * reference names and never resolved values (§9.2): the runner holds no vault credential and has
 * nothing to do with a value"</em>, was half right and half exactly backwards: §9.2 says the runner
 * <em>"may receive per-run values"</em>, and holding no vault credential is precisely <b>why</b>
 * the worker must hand them over.
 *
 * <p>It carries no approved-target policy field: ADR-002 O-6 (destination policy on the job versus
 * at the egress layer) is still open. It does carry {@code secretOrigins}, the per-secret origin
 * binding read from each secret's own vault entry: the runner refuses to type a secret on a page
 * whose origin is not listed for it, and refuses a secret bound to none. What else is decidable
 * today — which policy identity this dispatch ran under — is recorded on the execution.
 *
 * @param executionId the execution
 * @param attemptId this attempt, never reused
 * @param revisionId the confirmed revision the execution snapshotted
 * @param artifactHash the canonical artifact hash from that revision (§4.2, §8.1)
 * @param artifact the immutable confirmed artifact from that revision (§4.4, §8.1)
 * @param source the ordered source lines from that revision, references still opaque
 * @param configuration the nonsecret configuration from that revision (§8.1); clamping is the
 *     runner's (10.13 AC-6) and nothing is clamped here
 * @param csi the execution's own immutable CSI (§8.1, §9.1), replacing the forbidden {@code csiId}
 * @param references the typed declaration (§4.5, §8.3), replacing the flat array
 * @param resolvedVars ephemeral resolved variable values (§8.4, §9.2)
 * @param resolvedSecrets ephemeral resolved secret values (§8.4, §9.2)
 * @param deadlines §8.5's admitted-start and runtime values, sent faithfully
 * @param videoKey the server-derived video key (§6.2); deriving a key is not writing an object
 * @param manifestKey the server-derived result manifest key (§5.3, §6.2)
 * @param referencePolicy the revision's ADR-SC-003 reference policy; {@code null} for legacy
 *     authoring, which keeps the runner's source-token reference check
 * @param secretOrigins normalized origins each resolved secret may be filled on, by secret id;
 *     nonsecret, and a secret absent here cannot be filled
 */
public record RunJob(
    UUID executionId,
    UUID attemptId,
    UUID revisionId,
    String artifactHash,
    JsonNode artifact,
    List<String> source,
    JsonNode configuration,
    String csi,
    ReferenceDeclarations references,
    Map<String, String> resolvedVars,
    @com.fasterxml.jackson.annotation.JsonIgnore
        Map<String, com.citi.put.checks.studio.secrets.SecretValue> resolvedSecrets,
    JobDeadlines deadlines,
    String videoKey,
    String manifestKey,
    JsonNode referencePolicy,
    Map<String, List<String>> secretOrigins,
    @com.fasterxml.jackson.annotation.JsonIgnore JsonNode observed) {

  public RunJob {
    secretOrigins = secretOrigins == null ? Map.of() : Map.copyOf(secretOrigins);
    observed = observed == null ? null : observed.deepCopy();
  }

  public RunJob(
      UUID executionId,
      UUID attemptId,
      UUID revisionId,
      String artifactHash,
      JsonNode artifact,
      List<String> source,
      JsonNode configuration,
      String csi,
      ReferenceDeclarations references,
      Map<String, String> resolvedVars,
      Map<String, com.citi.put.checks.studio.secrets.SecretValue> resolvedSecrets,
      JobDeadlines deadlines,
      String videoKey,
      String manifestKey,
      JsonNode referencePolicy,
      Map<String, List<String>> secretOrigins) {
    this(
        executionId,
        attemptId,
        revisionId,
        artifactHash,
        artifact,
        source,
        configuration,
        csi,
        references,
        resolvedVars,
        resolvedSecrets,
        deadlines,
        videoKey,
        manifestKey,
        referencePolicy,
        secretOrigins,
        null);
  }

  @Override
  public String toString() {
    return "RunJob[executionId=" + executionId + ", attemptId=" + attemptId + ", secrets=<secret>]";
  }

  @Override
  public JsonNode observed() {
    return observed == null ? null : observed.deepCopy();
  }

  public static RunJob observed(JsonNode wire) {
    return observed(wire, Map.of(), Map.of());
  }

  public static RunJob observed(
      JsonNode wire,
      Map<String, com.citi.put.checks.studio.secrets.SecretValue> secrets,
      Map<String, List<String>> origins) {
    JsonNode binding = wire.path("binding");
    UUID executionId = UUID.fromString(binding.path("executionId").asText());
    UUID attemptId = UUID.fromString(binding.path("attemptId").asText());
    UUID testId = UUID.fromString(binding.path("testId").asText());
    String csi = binding.path("csiId").asText();
    com.citi.put.checks.studio.guided.session.GuidedSessionException.require(
        csi.matches("[A-Za-z0-9_-]{1,20}"), "FORBIDDEN_SCOPE", 403);
    return new RunJob(
        executionId,
        attemptId,
        UUID.fromString(binding.path("revisionId").asText()),
        binding.path("artifactHash").asText(),
        wire.path("artifact"),
        List.of(),
        wire.path("configuration"),
        csi,
        new ReferenceDeclarations(List.of(), List.copyOf(secrets.keySet())),
        Map.of(),
        secrets,
        new JobDeadlines(30000, wire.path("runtime").path("totalRuntimeMs").asLong()),
        videoKeyFor(csi, testId, executionId, attemptId),
        manifestKeyFor(csi, testId, executionId, attemptId),
        wire.path("artifact").path("replayPolicy"),
        origins,
        wire);
  }

  public RunJob(
      UUID executionId,
      UUID attemptId,
      UUID revisionId,
      String artifactHash,
      JsonNode artifact,
      List<String> source,
      JsonNode configuration,
      String csi,
      ReferenceDeclarations references,
      Map<String, String> resolvedVars,
      Map<String, com.citi.put.checks.studio.secrets.SecretValue> resolvedSecrets,
      JobDeadlines deadlines,
      String videoKey,
      String manifestKey,
      JsonNode referencePolicy) {
    this(
        executionId,
        attemptId,
        revisionId,
        artifactHash,
        artifact,
        source,
        configuration,
        csi,
        references,
        resolvedVars,
        resolvedSecrets,
        deadlines,
        videoKey,
        manifestKey,
        referencePolicy,
        Map.of());
  }

  public RunJob(
      UUID executionId,
      UUID attemptId,
      UUID revisionId,
      String artifactHash,
      JsonNode artifact,
      List<String> source,
      JsonNode configuration,
      String csi,
      ReferenceDeclarations references,
      Map<String, String> resolvedVars,
      Map<String, com.citi.put.checks.studio.secrets.SecretValue> resolvedSecrets,
      JobDeadlines deadlines,
      String videoKey,
      String manifestKey) {
    this(
        executionId,
        attemptId,
        revisionId,
        artifactHash,
        artifact,
        source,
        configuration,
        csi,
        references,
        resolvedVars,
        resolvedSecrets,
        deadlines,
        videoKey,
        manifestKey,
        null,
        Map.of());
  }

  /**
   * Server-issued deadlines (§8.5, contract {@code JobDeadlines}).
   *
   * @param admittedStartMs how long an admitted run may take to start a browser
   * @param totalRuntimeMs the browser runtime cap, parent-enforced (§5.2)
   */
  public record JobDeadlines(long admittedStartMs, long totalRuntimeMs) {}

  /** The §6.2 video key template. Derived from immutable execution identity, never supplied. */
  public static String videoKeyFor(String csiId, UUID testId, UUID executionId, UUID attemptId) {
    return "studio/" + csiId + '/' + testId + '/' + executionId + '/' + attemptId + ".webm";
  }

  /** The §6.2 result manifest key template. */
  public static String manifestKeyFor(String csiId, UUID testId, UUID executionId, UUID attemptId) {
    return "studio/" + csiId + '/' + testId + '/' + executionId + '/' + attemptId + ".result.json";
  }
}
