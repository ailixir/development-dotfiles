package com.citi.put.checks.studio.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Story 10.15 AC-4, AC-21, AC-23 — what the frozen document says about {@code getExecutionVideo},
 * and what nothing else in it may lose while this story edits it.
 *
 * <p><b>Deliberately not a Spring test.</b> Everything here reads files. A Testcontainers-gated
 * class is silently skipped on a machine with no Docker, and story 10.18a's QA gate found exactly
 * that shape reporting a green tier that enforced nothing. The half of AC-21 that needs the running
 * application — <i>the route really is reachable</i> — lives in {@code StudioContractTest}, which
 * needs a context for other reasons.
 */
class ExecutionVideoContractTest {

  private static final Path MANIFEST = Path.of("..", "docs", "epics", "EPIC-10-EXECUTION.yaml");

  /**
   * Where a story outside every epic manifest is declared: {@code docs/stories/{ID}/{ID}.story.md},
   * headed {@code # Story {ID}}. STUDIO-SCHED-001 is such a story and attributes the scheduling
   * operations; reading only @pm's Epic 10 manifest would call a real story unknown.
   */
  private static final Path STORIES = Path.of("..", "docs", "stories");

  /**
   * The operations that carry a planning attribution today, pinned as a <b>deliberate second
   * copy</b>.
   *
   * <p>This is the remedy the epic's eighteenth catalogued shape prescribes: a coverage set derived
   * only from the artefact under test shrinks when the artefact shrinks. The list is compared both
   * ways against the document, and the total is asserted, because a floor is not a guard. A future
   * story that legitimately attributes another operation edits this list — that edit is the record.
   */
  private static final Set<String> OPERATIONS_CARRYING_ATTRIBUTION =
      new TreeSet<>(
          List.of(
              "streamExecution",
              "getExecutionVideo",
              // STUDIO-OBS-014 C2a: claimAdmission is deleted from the document.
              "reportProgress",
              "runnerHealth",
              "runnerReadiness",
              // STUDIO-OBS-012A: the seven guided-session operations move into the one public
              // document under /api/v1/studio with their OBS-003/005/006 attributions.
              "startGuidedSession",
              "readGuidedSession",
              "readGuidedResult",
              "readGuidedClarification",
              // STUDIO-UNIFY-001.6: the caller's latest learning attempt per test.
              "readLatestGuidedAttempts",
              "clarifyGuidedSession",
              "cancelGuidedSession",
              "finalizeObservedPublication",
              // STUDIO-OBS-013 (AR-1): the guided learn-run recording route.
              "getGuidedSessionVideo",
              // STUDIO-UNIFY-001.6: the caller's latest terminal attempt per test.
              "readLatestGuidedAttempts",
              // STUDIO-OBS-008 C-int W1 (P1): the per-test capability read.
              "getStudioTestCapabilities"));

  /** {@code $ref} targets, spelled once so a typo cannot make two assertions agree by accident. */
  private static final String SESSION_UNAUTHORIZED = "#/components/responses/SessionUnauthorized";

  private static final String UNAUTHORIZED = "#/components/responses/Unauthorized";
  private static final String RUNNER_UNAUTHENTICATED =
      "#/components/responses/RunnerUnauthenticated";

  /**
   * The public operations whose {@code 401} is written by {@code BffSessionAuthenticationFilter},
   * pinned as a <b>deliberate second copy</b> — ADR-002 §25.4's eleven, plus {@code
   * getExecutionVideo}, which §24.6 declares a {@code 401} for in the same commit and which
   * therefore was never one of the eleven {@code Unauthorized} references to replace.
   *
   * <p>Same remedy, and the same reason, as {@link #OPERATIONS_CARRYING_ATTRIBUTION}: there is no
   * production vocabulary that enumerates the document's operations, so a set derived only from the
   * document is a statement that the document equals itself. A correctly-tagged thirteenth public
   * operation passes every derived comparison below and is caught by this list and by the count
   * alone — which is exactly why neither may be dropped as redundant with the other.
   */
  private static final Set<String> PUBLIC_OPERATIONS_DECLARING_UNAUTHENTICATED =
      new TreeSet<>(
          List.of(
              "listTests",
              "createTest",
              "getTest",
              "updateTest",
              "deleteTest",
              "executeTest",
              "listExecutions",
              "getExecution",
              "streamExecution",
              "getExecutionVideo",
              // Studio v1 WP4 (ADR-002 §29), the thirteenth, added deliberately.
              "cancelExecution",
              // studio-vault-secrets (ADR-002 §32), the fourteenth and fifteenth, added
              // deliberately.
              "listTestSecrets",
              "createTestSecret",
              // STUDIO-OBS-012A: validate-variables and the seven guided-session routes are
              // session-authenticated public operations of the one public document (21 -> 29).
              "validateTestVariables",
              "startGuidedSession",
              "readGuidedSession",
              "readGuidedResult",
              "readGuidedClarification",
              // STUDIO-UNIFY-001.6: the caller's latest learning attempt per test.
              "readLatestGuidedAttempts",
              "clarifyGuidedSession",
              "cancelGuidedSession",
              "finalizeObservedPublication",
              // STUDIO-OBS-013 (AR-1): getGuidedSessionVideo is a session-authenticated public
              // route (29 -> 30).
              "getGuidedSessionVideo",
              // STUDIO-UNIFY-001.6: a session-authenticated public route (30 -> 31).
              "readLatestGuidedAttempts",
              // STUDIO-OBS-008 C-int W1 (P1): a session-authenticated public route (31 -> 32).
              "getStudioTestCapabilities",
              // SC008-E5: "Verify again" re-runs the proof; session-authenticated like
              // executeTest (24 -> 25).
              "verifyRecordedRevision"));

  /**
   * The two internal callbacks, whose {@code 401} comes from {@code
   * ServiceIdentityAuthenticationFilter} and really is the flat {@code ErrorResponse}. Pinned for
   * the same reason as the list above.
   */
  private static final Set<String> CALLBACK_OPERATIONS_DECLARING_UNAUTHENTICATED =
      new TreeSet<>(
          // ADR-002 §29.4 adds the control read, served by the same filter.
          // Approved OBS006 adds observed admission under that unchanged service-token filter.
          // STUDIO-OBS-014 C2a: claimAdmission is deleted (4 -> 3).
          List.of("reportProgress", "readExecutionControl", "admitObservedExecution"));

  private static final Set<String> RUNNER_OPERATIONS_DECLARING_UNAUTHENTICATED =
      new TreeSet<>(
          List.of(
              "runnerCancelRun",
              "runnerHealth",
              "runnerReadiness",
              "validateObservedPublication",
              "runObservedRevision"));

  private static ContractDocument document;
  private static String raw;

  @BeforeAll
  static void load() throws IOException {
    document = ContractDocument.load();
    raw = Files.readString(ContractDocument.CONTRACT, StandardCharsets.UTF_8);
  }

  // ── AC-4: exactly two parameters, read from the document ─────────────────

  @Test
  @SuppressWarnings("unchecked")
  void theOperationDeclaresExactlyThePathIdAndTheDownloadFlag() {
    List<Object> parameters =
        (List<Object>) document.getOperation(ContractDocument.VIDEO_PATH).get("parameters");

    assertThat(parameters).hasSize(2);
    assertThat(ContractDocument.at(parameters.get(0), "$ref"))
        .isEqualTo("#/components/parameters/ExecutionId");
    Map<String, Object> download = (Map<String, Object>) parameters.get(1);
    assertThat(download.get("name")).isEqualTo("download");
    assertThat(download.get("in")).isEqualTo("query");
    assertThat(ContractDocument.at(download, "schema", "type")).isEqualTo("boolean");

    // SPK-02's shape for this story: an ambient-session route that must not add a token parameter.
    for (Object parameter : parameters) {
      Object name = ContractDocument.at(parameter, "name");
      if (name != null) {
        assertThat(String.valueOf(name).toLowerCase(java.util.Locale.ROOT))
            .as("no credential is ever carried in a URL or a query string")
            .doesNotContain("token")
            .doesNotContain("auth")
            .doesNotContain("key");
      }
    }
  }

  // ── AC-21.1–.3: the three content-less responses are declared ────────────

  @Test
  void theRangeResponseDeclaresItsContentAndItsTwoHeaders() {
    Object response = responseOf("206");

    assertThat(ContractDocument.at(response, "content", "video/webm", "schema", "format"))
        .as("a 206 on this route carries video bytes, and the document now says so")
        .isEqualTo("binary");
    assertThat(ContractDocument.at(response, "headers", "Content-Range", "schema", "type"))
        .isEqualTo("string");
    assertThat(ContractDocument.at(response, "headers", "Content-Length", "schema", "type"))
        .isEqualTo("integer");
  }

  @Test
  void theNotFoundResponseDeclaresAnErrorResponseBody() {
    assertThat(
            ContractDocument.at(responseOf("404"), "content", "application/json", "schema", "$ref"))
        .as(
            "ADR-002 §12's own example of a Class A defect is a response with a description and "
                + "no content; this is that response")
        .isEqualTo("#/components/schemas/ErrorResponse");
  }

  @Test
  void theUnsatisfiableRangeResponseDeclaresABodyAndItsContentRangeHeader() {
    Object response = responseOf("416");

    assertThat(ContractDocument.at(response, "content", "application/json", "schema", "$ref"))
        .isEqualTo("#/components/schemas/ErrorResponse");
    assertThat(ContractDocument.at(response, "headers", "Content-Range", "schema", "type"))
        .as("RFC 9110 requires `bytes */S` on a 416, so the document declares the header")
        .isEqualTo("string");
  }

  // ── AC-21.4: the marker comes off, and the attribution is corrected ──────

  @Test
  void theMarkerIsGoneAndTheAttributionNamesTheStoryThatShipsTheRoute() {
    Map<String, Object> operation = document.getOperation(ContractDocument.VIDEO_PATH);

    assertThat(operation.get("x-not-yet-implemented"))
        .as("this story ships the route, so the document may no longer declare it unshipped")
        .isNull();
    assertThat(operation.get("x-implemented-by"))
        .as(
            "the value was '10.16', which is the FRONTEND playback story; the manifest and the"
                + " retired epic both place the backend route in 10.15. A vendor extension naming a"
                + " story that will never implement the route is a defect nothing could ever have"
                + " satisfied — ruled Class A by @po at wave-6 validation, and reported as a"
                + " finding")
        .isEqualTo("10.15");
  }

  @Test
  void thisIsTheLastOperationTheDocumentDeclaredAsUnshipped() {
    assertThat(pendingOperations(document))
        .as(
            "§13's last row recorded `GET /executions/{id}/video` as the only pending operation; "
                + "this story is the one that clears it")
        .isEmpty();
  }

  /**
   * The control the story calls mandatory rather than decorative.
   *
   * <p>An {@code isEmpty()} assertion is satisfied by a helper that has stopped working — one that
   * throws, returns null-as-empty, or has stopped finding the flag. So the same reader is pointed
   * at a scratch copy carrying a marker on a <b>different</b> operation and must report exactly
   * that one.
   */
  @Test
  void theEmptyPendingSetIsProducedByAReaderThatCanStillFindAMarker() throws IOException {
    Path scratch =
        scratchCopy(
            "      operationId: getExecution\n",
            "      operationId: getExecution\n      x-not-yet-implemented: true\n");

    assertThat(pendingOperations(ContractDocument.loadFrom(scratch)))
        .as("the reader no longer finds a marker it is shown; the isEmpty() above proves nothing")
        .containsExactly("GET /executions/{id}");
  }

  // ── AC-21: attribution ↔ manifest id, both ways, with its control ────────

  @Test
  void everyAttributionNamesAStoryTheManifestDeclares() throws IOException {
    Set<String> storyIds = manifestStoryIds(MANIFEST);
    assertThat(storyIds)
        .as("the manifest reader found no story ids at all; the assertion below would be vacuous")
        .hasSizeGreaterThan(10);
    Set<String> standalone = standaloneStoryIds(STORIES);
    assertThat(standalone)
        .as("the standalone-story reader no longer finds the story that attributes scheduling")
        .contains("STUDIO-SCHED-001")
        .doesNotContain("99.9");
    storyIds.addAll(standalone);

    assertThat(unknownAttributions(document, storyIds))
        .as(
            "an x-implemented-by value naming no story in %s. A vendor extension nothing at "
                + "runtime depends on is exactly what rots unnoticed, which is why this closes the "
                + "class rather than the instance",
            MANIFEST)
        .isEmpty();
  }

  @Test
  void theSetOfOperationsCarryingAnAttributionIsPinnedBothWays() {
    Set<String> carrying = operationsCarryingAttribution(document);

    assertThat(carrying)
        .as("an operation lost its x-implemented-by, or gained one without this pin being updated")
        .isEqualTo(OPERATIONS_CARRYING_ATTRIBUTION);
    assertThat(carrying)
        .as(
            "the total, read from the document — a set comparison alone hides a collection that "
                + "silently stopped collecting")
        .hasSize(OPERATIONS_CARRYING_ATTRIBUTION.size());
  }

  /** The scratch-copy control: the reader is shown a bad attribution and must name exactly it. */
  @Test
  void theAttributionReaderCanActuallyFindABadValue() throws IOException {
    Path scratch = scratchCopy("x-implemented-by: '10.15'", "x-implemented-by: '99.9'");
    Set<String> storyIds = manifestStoryIds(MANIFEST);
    storyIds.addAll(standaloneStoryIds(STORIES));

    assertThat(unknownAttributions(ContractDocument.loadFrom(scratch), storyIds))
        .as("the reader did not notice a story id that does not exist")
        .containsExactly("99.9");
  }

  // ── AC-23: the document's other invariants, asserted in-test ─────────────

  /**
   * The pin in the runner tree says the document moved; it cannot say which bytes. This can.
   *
   * <p><b>The scan is over key positions, not over the raw text.</b> The document's own header
   * documents the convention in prose — <i>"Routes marked `x-not-yet-implemented: true` are
   * declared here so that dependent stories build"</i> — so a whole-text grep matches the
   * artefact's documentation of itself, which is the epic's thirteenth catalogued vacuous shape.
   * The predicate here matches the marker only where a YAML key can be, and {@link
   * #theMarkerScanCanStillFindAMarker()} shows it finding one.
   */
  @Test
  void noOperationCarriesAPendingMarkerInEitherView() {
    assertThat(pendingOperations(document)).isEmpty();
    assertThat(markerKeyLines(raw))
        .as("a marker survives as a YAML key somewhere in the document")
        .isEmpty();
    assertThat(raw)
        .as(
            "the control's premise: the prose that documents the convention is still there, so "
                + "the scan above really is narrower than a grep and not merely lucky")
        .contains("Routes marked `x-not-yet-implemented: true`");
  }

  /** The control for the scan above: it is shown finding a marker that really is a key. */
  @Test
  void theMarkerScanCanStillFindAMarker() throws IOException {
    Path scratch =
        scratchCopy(
            "      operationId: getExecution\n",
            "      operationId: getExecution\n      x-not-yet-implemented: true\n");

    assertThat(markerKeyLines(Files.readString(scratch, StandardCharsets.UTF_8)))
        .as("the marker scan cannot find a marker it is shown; the emptiness above proves nothing")
        .hasSize(1);
  }

  /**
   * Lines on which {@code x-not-yet-implemented} appears as a YAML key rather than inside prose.
   */
  private static List<String> markerKeyLines(String text) {
    List<String> found = new ArrayList<>();
    Matcher matcher = Pattern.compile("(?m)^[ \\t]*x-not-yet-implemented[ \\t]*:.*$").matcher(text);
    while (matcher.find()) {
      found.add(matcher.group().trim());
    }
    return found;
  }

  /**
   * A deliberate hand-kept copy of this operation's status set, updated by ruling rather than by
   * drift.
   *
   * <p>Story 10.15 left this at {@code 200, 206, 404, 410, 416} and said so: <i>that story declared
   * CONTENT on three responses, and adding or removing a STATUS was AC-22's, escalated as ESC-1 and
   * ESC-2 and not taken there</i>. <b>Story 10.31 does add the three statuses</b>, because the
   * architect ruled both escalations in ADR-002 §24 — {@code 401} and {@code 403} by §24.2, {@code
   * 503} by §24.4 — and §24.7's table names this literal as the owner's to update in the same PR.
   * The copy stays a copy: deriving it from the document would make this a statement that the
   * document equals itself.
   */
  @Test
  void theVideoOperationsStatusSetMatchesTheApprovedEscalationRuling() {
    assertThat(declaredStatuses())
        .as(
            "story 10.31 declares 401, 403 and 503 on this operation by ADR-002 §24's ruling, "
                + "closing ESC-1 and ESC-2; any OTHER movement of this set is undeclared drift")
        .containsExactlyInAnyOrder("200", "206", "401", "403", "404", "410", "416", "503");
  }

  // ── story 10.31 AC-5: the refusals are the siblings' own components ───────

  /**
   * ADR-002 §24.3: the video route's {@code 401} and {@code 403} are <b>the snapshot route's own
   * components, reached by {@code $ref}</b>, because the route literally reuses the snapshot
   * route's authorized read. §24.7 says how to check it: <i>"by comparing the two, not against a
   * literal. A route-local copy then fails."</i>
   *
   * <p>Asserted against {@code getExecution} rather than against a spelled-out component name, so a
   * later story that legitimately renames or re-points <em>both</em> routes' refusals moves this
   * test with them, while one that re-points only the video route reddens it.
   */
  @Test
  void theVideoRoutesRefusalRefsAreItsSiblingsOwn() {
    Map<String, Object> video = document.getOperation(ContractDocument.VIDEO_PATH);
    Map<String, Object> snapshot = document.getOperation("/executions/{id}");

    Object snapshotUnauthenticated = ContractDocument.at(snapshot, "responses", "401", "$ref");
    Object snapshotForbidden = ContractDocument.at(snapshot, "responses", "403", "$ref");

    assertThat(snapshotUnauthenticated)
        .as(
            "the premise: getExecution really does declare its 401 by $ref, so the comparison "
                + "below is between two real values rather than between two nulls")
        .isNotNull();
    assertThat(snapshotForbidden)
        .as("the premise: getExecution really does declare its 403 by $ref")
        .isNotNull();

    assertThat(ContractDocument.at(video, "responses", "401", "$ref"))
        .as(
            "getExecutionVideo's 401 must be the SAME component getExecution uses (%s). A "
                + "route-local copy drifts on the first edit to either — ADR-002 §24.3",
            snapshotUnauthenticated)
        .isEqualTo(snapshotUnauthenticated);
    assertThat(ContractDocument.at(video, "responses", "403", "$ref"))
        .as(
            "getExecutionVideo's 403 must be the SAME component getExecution uses (%s)",
            snapshotForbidden)
        .isEqualTo(snapshotForbidden);
  }

  // ── story 10.31 AC-2: which 401 envelope each operation declares ──────────

  /**
   * ADR-002 §25.4 — every operation's {@code 401} points at the component its <b>own producer</b>
   * writes, partitioned by the document's own {@code internal} tag.
   *
   * <p><b>The partition is the tag, never the path.</b> Runner operations are internal on paths
   * that do not start with {@code /internal/studio/} — {@code runObservedRevision} ({@code
   * /v2/runs}), {@code runnerHealth} ({@code /health}) and {@code runnerReadiness} ({@code /ready})
   * among them — so a path-prefix rule would count them as "public" operations and be false against
   * the correct document. {@code info.description} defines the partition itself: <i>"Routes tagged
   * `internal` are not exposed through public ingress … each declares … exactly one of `runner` or
   * `api-callback` next to `internal`."</i>
   *
   * <p>Three producers, three components, asserted in both directions:
   *
   * <ul>
   *   <li>untagged-{@code internal} → {@code SessionUnauthorized} ({@code
   *       BffSessionAuthenticationFilter}, nested {@code error})
   *   <li>{@code internal}+{@code api-callback} → {@code Unauthorized} ({@code
   *       ServiceIdentityAuthenticationFilter}, flat {@code error})
   *   <li>{@code internal}+{@code runner} → {@code RunnerUnauthenticated}. Story 10.31 changes
   *       nothing here; it is asserted so the partition is complete rather than merely disjoint.
   * </ul>
   */
  @Test
  void everyOperationsUnauthenticatedResponsePointsAtItsOwnProducersEnvelope() {
    Map<String, String> publicRefs =
        unauthenticatedRefs(document, tags -> !tags.contains("internal"));
    Map<String, String> callbackRefs =
        unauthenticatedRefs(
            document, tags -> tags.contains("internal") && tags.contains("api-callback"));
    Map<String, String> runnerRefs =
        unauthenticatedRefs(document, tags -> tags.contains("internal") && tags.contains("runner"));
    Map<String, String> allRefs = unauthenticatedRefs(document, tags -> true);

    // The partition is total: no operation declaring a 401 falls outside the three buckets. Without
    // this, an operation tagged `internal` and nothing else escapes every assertion below.
    Set<String> partitioned = new TreeSet<>(publicRefs.keySet());
    partitioned.addAll(callbackRefs.keySet());
    partitioned.addAll(runnerRefs.keySet());
    assertThat(partitioned)
        .as(
            "an operation declaring a 401 is in none of the three buckets — its tags name neither "
                + "`runner` nor `api-callback` beside `internal`, which info.description forbids")
        .isEqualTo(new TreeSet<>(allRefs.keySet()));

    assertThat(publicRefs.values())
        .as(
            "a public operation declares a 401 body its producer never sends (ADR-002 §25.3): %s",
            publicRefs)
        .allMatch(SESSION_UNAUTHORIZED::equals);
    assertThat(callbackRefs.values())
        .as(
            "an internal callback's 401 comes from ServiceIdentityAuthenticationFilter and really "
                + "IS the flat ErrorResponse, so Unauthorized is correct for it and must stay: %s",
            callbackRefs)
        .allMatch(UNAUTHORIZED::equals);
    assertThat(runnerRefs.values())
        .as("a runner operation's 401 is the runner's own problem envelope: %s", runnerRefs)
        .allMatch(RUNNER_UNAUTHENTICATED::equals);

    Map<String, String> internalRefs = new TreeMap<>(callbackRefs);
    internalRefs.putAll(runnerRefs);
    assertThat(internalRefs.values())
        .as("no internal operation may point at the public session envelope: %s", internalRefs)
        .noneMatch(SESSION_UNAUTHORIZED::equals);

    // Each total on its own. A set comparison alone is satisfied by two collections that stopped
    // collecting together, and a correctly-added thirteenth public operation passes every
    // comparison above.
    // STUDIO-OBS-013: + getGuidedSessionVideo (29 -> 30). STUDIO-UNIFY-001.6: +
    // readLatestGuidedAttempts (30 -> 31). STUDIO-OBS-008 C-int W1: + getStudioTestCapabilities
    // (31 -> 32). STUDIO-GOV-001.3 deleted five operations that had declared the public 401
    // (guided policies), and STUDIO-GOV-001.2 deleted the eight Studio schedule operations that
    // had declared it (32 -> 24). SC008-E5: + verifyRecordedRevision (24 -> 25).
    assertThat(publicRefs).as("the number of public operations declaring a 401 moved").hasSize(25);
    assertThat(callbackRefs)
        .as("the number of internal callbacks declaring a 401 moved")
        .hasSize(3);
    // STUDIO-OBS-012A: artifact-1 POST /v1/validate and POST /v1/runs are gone (7 -> 5).
    assertThat(runnerRefs).as("the number of runner operations declaring a 401 moved").hasSize(5);

    // The pinned second copies, both ways.
    assertThat(publicRefs.keySet())
        .as("a public operation the document declares a 401 for that this pin does not name")
        .containsExactlyElementsOf(PUBLIC_OPERATIONS_DECLARING_UNAUTHENTICATED);
    assertThat(PUBLIC_OPERATIONS_DECLARING_UNAUTHENTICATED)
        .as("an operation this pin names that no longer declares a 401 as a public operation")
        .containsExactlyElementsOf(publicRefs.keySet());
    assertThat(callbackRefs.keySet())
        .as("an internal callback the document declares a 401 for that this pin does not name")
        .containsExactlyElementsOf(CALLBACK_OPERATIONS_DECLARING_UNAUTHENTICATED);
    assertThat(CALLBACK_OPERATIONS_DECLARING_UNAUTHENTICATED)
        .as("an operation this pin names that is no longer an internal callback declaring a 401")
        .containsExactlyElementsOf(callbackRefs.keySet());
    assertThat(runnerRefs.keySet())
        .as("a runner operation declares a 401 that this independent pin does not name")
        .containsExactlyElementsOf(RUNNER_OPERATIONS_DECLARING_UNAUTHENTICATED);
    assertThat(RUNNER_OPERATIONS_DECLARING_UNAUTHENTICATED)
        .as("a pinned runner operation no longer declares its producer's 401")
        .containsExactlyElementsOf(runnerRefs.keySet());
  }

  /**
   * Every operation whose tags satisfy {@code tagFilter} and which declares a {@code 401}, keyed by
   * {@code operationId} and valued as that response's {@code $ref}.
   *
   * <p>Statuses are matched by {@code String.valueOf} over the response keys rather than by looking
   * up the literal {@code "401"}, so an unquoted {@code 401:} — which YAML reads as an integer key
   * — is still found instead of silently shrinking every set below.
   */
  @SuppressWarnings("unchecked")
  private static Map<String, String> unauthenticatedRefs(
      ContractDocument source, Predicate<List<String>> tagFilter) {
    Map<String, String> refs = new TreeMap<>();
    source
        .paths()
        .forEach(
            (path, item) ->
                ((Map<String, Object>) item)
                    .forEach(
                        (method, operation) -> {
                          if (!(operation instanceof Map)) {
                            return;
                          }
                          Map<String, Object> declared = (Map<String, Object>) operation;
                          Object responses = declared.get("responses");
                          if (!(responses instanceof Map)) {
                            return;
                          }
                          Object unauthenticated = null;
                          for (Map.Entry<Object, Object> entry :
                              ((Map<Object, Object>) responses).entrySet()) {
                            if ("401".equals(String.valueOf(entry.getKey()))) {
                              unauthenticated = entry.getValue();
                            }
                          }
                          if (unauthenticated == null) {
                            return;
                          }
                          List<String> tags =
                              declared.get("tags") instanceof List
                                  ? (List<String>) declared.get("tags")
                                  : List.of();
                          if (!tagFilter.test(tags)) {
                            return;
                          }
                          refs.put(
                              String.valueOf(declared.get("operationId")),
                              String.valueOf(ContractDocument.at(unauthenticated, "$ref")));
                        }));
    return refs;
  }

  /**
   * {@code VideoEvidence.required} is unchanged, asserted against the document's own nullability
   * rather than against a transcribed list.
   */
  @Test
  @SuppressWarnings("unchecked")
  void videoEvidenceStillRequiresExactlyItsNonNullableProperties() {
    Map<String, Object> schema =
        (Map<String, Object>)
            ContractDocument.at(document.root(), "components", "schemas", "VideoEvidence");
    Map<String, Object> properties = (Map<String, Object>) schema.get("properties");

    Set<String> notNullable = new TreeSet<>();
    properties.forEach(
        (name, property) -> {
          if (!Boolean.TRUE.equals(ContractDocument.at(property, "nullable"))) {
            notNullable.add(name);
          }
        });

    assertThat(new TreeSet<>((List<String>) schema.get("required")))
        .as("required and nullable disagree on VideoEvidence")
        .isEqualTo(notNullable);
  }

  /**
   * {@code RunnerEvidence.required} names only things that exist — and <b>deliberately says nothing
   * about which</b> of them are required.
   *
   * <p><b>Weakened on purpose, after @qa's LOW-4.</b> The first form of this test asserted set
   * <em>equality</em> with the Java record's components. That is stronger than AC-23 asks for, over
   * a schema <b>this story does not own</b>: a later story that legitimately makes one component
   * optional again would have reddened story 10.15's test while touching nothing of 10.15's
   * subject. That is `FOC-04`'s shape — the false red that has already cost this epic three
   * blameless investigations — and the fix is to assert only what cannot legitimately change.
   *
   * <p>What cannot legitimately change: a {@code required} entry must name a property the schema
   * declares <em>and</em> a component the Java record declares. A renamed or misspelled entry is a
   * defect in any story; a shorter or longer list is a ruling. The membership question belongs to
   * whoever owns {@code RunnerEvidence} — O-14 was landed by story 10.18a, not by this one — and is
   * asserted from the other side by the runner's own {@code confinement.test.ts}, which pins §20's
   * promotion of {@code partial} explicitly.
   *
   * <p>Non-vacuity: the list is asserted non-empty, so a reader that found nothing fails instead of
   * reporting a clean document.
   */
  @Test
  @SuppressWarnings("unchecked")
  void everyRunnerEvidenceRequiredEntryNamesSomethingBothArtefactsDeclare() {
    Map<String, Object> schema =
        (Map<String, Object>)
            ContractDocument.at(document.root(), "components", "schemas", "RunnerEvidence");

    Set<String> fromJava =
        java.util.Arrays.stream(
                com.citi.put.checks.studio.internal.dto.RunnerEvidence.class.getRecordComponents())
            .map(java.lang.reflect.RecordComponent::getName)
            .collect(java.util.stream.Collectors.toCollection(TreeSet::new));
    Set<String> declaredProperties =
        new TreeSet<>(((Map<String, Object>) schema.get("properties")).keySet());
    Set<String> required = new TreeSet<>((List<String>) schema.get("required"));

    assertThat(required)
        .as("RunnerEvidence declares no required fields at all; the checks below would be vacuous")
        .isNotEmpty();
    assertThat(declaredProperties)
        .as(
            "a RunnerEvidence required entry names no declared property — a rename landed on one"
                + " side only. WHICH fields are required is not this story's and is not asserted"
                + " here")
        .containsAll(required);
    assertThat(fromJava)
        .as(
            "a RunnerEvidence required entry names no component of the Java record that serializes"
                + " it — the document and the producer disagree about a field's NAME, which is a"
                + " defect in any story, unlike its optionality, which is a ruling")
        .containsAll(required);
  }

  // ── readers ──────────────────────────────────────────────────────────────

  @SuppressWarnings("unchecked")
  private static Set<String> declaredStatuses() {
    Map<String, Object> responses =
        (Map<String, Object>) document.getOperation(ContractDocument.VIDEO_PATH).get("responses");
    return new TreeSet<>(
        responses.keySet().stream()
            .map(String::valueOf)
            .collect(java.util.stream.Collectors.toSet()));
  }

  /**
   * getExecutionVideo's response for {@code status}, read through a {@code $ref} when the route
   * declares one (E-1: C2a moves 404/410/416 to the shared components; every asserted value stays
   * the same, only the read path changes).
   */
  private static Object responseOf(String status) {
    return document.deref(
        ContractDocument.at(
            document.getOperation(ContractDocument.VIDEO_PATH), "responses", status));
  }

  @SuppressWarnings("unchecked")
  private static Set<String> pendingOperations(ContractDocument source) {
    Set<String> pending = new TreeSet<>();
    source
        .paths()
        .forEach(
            (path, item) ->
                ((Map<String, Object>) item)
                    .forEach(
                        (method, operation) -> {
                          if (operation instanceof Map
                              && Boolean.TRUE.equals(
                                  ((Map<String, Object>) operation).get("x-not-yet-implemented"))) {
                            pending.add(method.toUpperCase(java.util.Locale.ROOT) + " " + path);
                          }
                        }));
    return pending;
  }

  @SuppressWarnings("unchecked")
  private static Set<String> operationsCarryingAttribution(ContractDocument source) {
    Set<String> carrying = new TreeSet<>();
    source
        .paths()
        .forEach(
            (path, item) ->
                ((Map<String, Object>) item)
                    .forEach(
                        (method, operation) -> {
                          if (operation instanceof Map
                              && ((Map<String, Object>) operation).get("x-implemented-by")
                                  != null) {
                            carrying.add(
                                String.valueOf(
                                    ((Map<String, Object>) operation).get("operationId")));
                          }
                        }));
    return carrying;
  }

  @SuppressWarnings("unchecked")
  private static List<String> unknownAttributions(ContractDocument source, Set<String> storyIds) {
    List<String> unknown = new ArrayList<>();
    source
        .paths()
        .forEach(
            (path, item) ->
                ((Map<String, Object>) item)
                    .forEach(
                        (method, operation) -> {
                          if (!(operation instanceof Map)) {
                            return;
                          }
                          Object value = ((Map<String, Object>) operation).get("x-implemented-by");
                          if (value != null && !storyIds.contains(String.valueOf(value))) {
                            unknown.add(String.valueOf(value));
                          }
                        }));
    return unknown;
  }

  /**
   * Story ids from the epic manifest, located by the {@code id:} key and nothing else.
   *
   * <p>Not by line position, not by surrounding text and not by the file's digest — that is @po's
   * requirement, because this reads <b>@pm's file</b> and must not go red because @pm re-indented
   * it.
   */
  private static Set<String> manifestStoryIds(Path manifest) throws IOException {
    Matcher matcher =
        Pattern.compile("^\\s*-\\s+id:\\s*\"?(?<id>10\\.[0-9]+[a-z]?)\"?\\s*$", Pattern.MULTILINE)
            .matcher(Files.readString(manifest, StandardCharsets.UTF_8));
    Set<String> ids = new LinkedHashSet<>();
    while (matcher.find()) {
      ids.add(matcher.group("id"));
    }
    return ids;
  }

  /**
   * Ids of stories declared outside any epic manifest: a directory {@code {ID}} holding {@code
   * {ID}.story.md} whose first line is {@code # Story {ID}}. A directory of loose QA or validation
   * notes, with no such file, declares nothing.
   */
  private static Set<String> standaloneStoryIds(Path stories) throws IOException {
    Set<String> ids = new TreeSet<>();
    try (var dirs = Files.list(stories)) {
      for (Path dir : dirs.filter(Files::isDirectory).toList()) {
        String id = dir.getFileName().toString();
        if (declaresStory(dir.resolve(id + ".story.md"), id)) {
          ids.add(id);
        }
        // A story group (STUDIO-OBS-012A): docs/stories/{GROUP}/{ID}.story.md headed the same way,
        // e.g. docs/stories/STUDIO-OBSERVED/STUDIO-OBS-003.story.md.
        try (var files = Files.list(dir)) {
          for (Path file : files.filter(Files::isRegularFile).toList()) {
            String name = file.getFileName().toString();
            if (name.endsWith(".story.md")) {
              String grouped = name.substring(0, name.length() - ".story.md".length());
              if (declaresStory(file, grouped)) {
                ids.add(grouped);
              }
            }
          }
        }
      }
    }
    return ids;
  }

  private static boolean declaresStory(Path story, String id) throws IOException {
    return Files.isRegularFile(story)
        && Files.readAllLines(story, StandardCharsets.UTF_8).stream()
            .findFirst()
            .filter(line -> line.startsWith("# Story " + id + " "))
            .isPresent();
  }

  /** A throwaway copy of the document with one substitution, for the non-vacuity controls. */
  private static Path scratchCopy(String find, String replace) throws IOException {
    assertThat(raw).as("the control's own needle is absent from the document").contains(find);
    Path scratch = Files.createTempFile("openapi-scratch", ".yaml");
    scratch.toFile().deleteOnExit();
    Files.writeString(scratch, raw.replace(find, replace), StandardCharsets.UTF_8);
    return scratch;
  }

  // ── STUDIO-OBS-013 (AR-1): the guided learn-run recording route ──────────
  //
  // Additions only. Nothing above is weakened: getExecutionVideo's own status set, parameters and
  // refusal shapes are still asserted exactly as before.

  private static final String GUIDED_VIDEO_PATH = "/guided-sessions/{id}/video";

  @SuppressWarnings("unchecked")
  private static Map<String, Object> guidedVideo() {
    Map<String, Object> operation = document.getOperation(GUIDED_VIDEO_PATH);
    assertThat(operation.get("operationId"))
        .as("the document declares GET %s (contract lane C1)", GUIDED_VIDEO_PATH)
        .isEqualTo("getGuidedSessionVideo");
    return operation;
  }

  @Test
  @SuppressWarnings("unchecked")
  void theGuidedVideoRouteDeclaresTheSessionIdAndOnlyTheDownloadFlag() {
    Map<String, Object> operation = guidedVideo();
    List<Object> pathParameters =
        (List<Object>) ContractDocument.at(document.paths(), GUIDED_VIDEO_PATH, "parameters");
    assertThat(pathParameters).hasSize(1);
    assertThat(ContractDocument.at(pathParameters.get(0), "$ref"))
        .as("the same id parameter readGuidedSession declares")
        .isEqualTo(
            ContractDocument.at(
                ((List<Object>)
                        ContractDocument.at(
                            document.paths(), "/guided-sessions/{id}", "parameters"))
                    .get(0),
                "$ref"));
    List<Object> parameters = (List<Object>) operation.get("parameters");
    assertThat(parameters).hasSize(1);
    assertThat(ContractDocument.at(parameters.get(0), "name")).isEqualTo("download");
    assertThat(ContractDocument.at(parameters.get(0), "in")).isEqualTo("query");
    assertThat(ContractDocument.at(parameters.get(0), "schema", "type")).isEqualTo("boolean");
  }

  @Test
  @SuppressWarnings("unchecked")
  void theGuidedVideoRouteHasTheExecutionVideoStatusSet() {
    Map<String, Object> responses = (Map<String, Object>) guidedVideo().get("responses");
    assertThat(responses.keySet().stream().map(String::valueOf).toList())
        .containsExactlyInAnyOrder("200", "206", "401", "403", "404", "410", "416", "503");
    assertThat(new TreeSet<>(responses.keySet().stream().map(String::valueOf).toList()))
        .isEqualTo(declaredStatuses());
  }

  @Test
  void theGuidedVideoRefusalsAreSharedComponentsWithTheExecutionRoutesShapes() {
    Map<String, Object> operation = guidedVideo();
    for (String[] pair :
        new String[][] {
          {"404", "VideoNoEvidence"}, {"410", "VideoExpired"}, {"416", "VideoRangeNotSatisfiable"}
        }) {
      assertThat(ContractDocument.at(operation, "responses", pair[0], "$ref"))
          .as("ADR-002 §24.3: a shared component, not a route-local copy")
          .isEqualTo("#/components/responses/" + pair[1]);
      Object component = ContractDocument.at(document.root(), "components", "responses", pair[1]);
      assertThat(ContractDocument.at(component, "content", "application/json", "schema", "$ref"))
          .as("%s carries the same body getExecutionVideo's %s does", pair[1], pair[0])
          .isEqualTo(
              ContractDocument.at(
                  responseOf(pair[0]), "content", "application/json", "schema", "$ref"));
    }
    Map<String, Object> execution = document.getOperation(ContractDocument.VIDEO_PATH);
    for (String status : new String[] {"404", "410", "416"}) {
      Object guidedRef = ContractDocument.at(operation, "responses", status, "$ref");
      Object executionRef = ContractDocument.at(execution, "responses", status, "$ref");
      // E-1 (C2a landed): both video routes reference the same shared component (ADR-002 §24.3).
      assertThat(guidedRef).as("the guided route declares %s by $ref", status).isNotNull();
      assertThat(executionRef)
          .as("both video routes use the same shared %s component", status)
          .isEqualTo(guidedRef);
      // Read through the reference either way: the same error code in the same example key.
      Object guided = document.deref(ContractDocument.at(operation, "responses", status));
      Object executionResponse = responseOf(status);
      assertThat(ContractDocument.at(guided, "content", "application/json", "examples"))
          .isInstanceOf(Map.class);
      @SuppressWarnings("unchecked")
      Map<String, Object> examples =
          (Map<String, Object>)
              ContractDocument.at(guided, "content", "application/json", "examples");
      for (String example : examples.keySet()) {
        assertThat(
                ContractDocument.at(
                    executionResponse,
                    "content",
                    "application/json",
                    "examples",
                    example,
                    "value",
                    "error"))
            .as("%s example %s carries the same code on both routes", status, example)
            .isEqualTo(
                ContractDocument.at(
                    guided, "content", "application/json", "examples", example, "value", "error"));
      }
    }
    Object unsatisfiable =
        ContractDocument.at(document.root(), "components", "responses", "VideoRangeNotSatisfiable");
    assertThat(ContractDocument.at(unsatisfiable, "headers", "Content-Range", "schema", "type"))
        .isEqualTo("string");
    assertThat(ContractDocument.at(operation, "responses", "401", "$ref"))
        .isEqualTo(SESSION_UNAUTHORIZED);
    assertThat(ContractDocument.at(operation, "responses", "403"))
        .as("the 403 is described exactly as readGuidedSession's: it IS that route's decision")
        .isEqualTo(
            ContractDocument.at(
                document.getOperation("/guided-sessions/{id}"), "responses", "403"));
  }

  @Test
  void theGuidedVideoRouteNamesTheStoryThatShipsIt() {
    assertThat(guidedVideo().get("x-implemented-by")).isEqualTo("STUDIO-OBS-013");
    assertThat(guidedVideo().get("x-not-yet-implemented")).isNull();
  }
}
