package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.internal.ProgressReportService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.assertj.core.api.SoftAssertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.7 AC-4a, AC-5, AC-6a, AC-20 — authorization on every public Studio route, the {@code
 * /internal/**} chain, and acknowledge-after-commit, all over real HTTP through the whole filter
 * chain.
 *
 * <p>Identities are supplied through the <b>existing header path</b> {@code
 * BffSessionAuthenticationFilter} already implements, which takes precedence over the `ED-02`
 * hardcoded bypass. That is what makes AC-5's narrower property decidable today: this story adds no
 * bypass and removes none, and asserts that its authorization decisions come from {@link
 * com.citi.put.checks.security.CsiOwnershipEvaluator} against the identity in the security context,
 * so a non-bypassed identity with the wrong CSI is rejected.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = "studio.execution.callback.service-token=test-service-identity-token")
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class StudioAuthorizationIT {

  private static final String CSI_ID = "60458";
  private static final String OTHER_CSI_ID = "60459";
  private static final String OWNER = "authz-owner@citi.com";
  private static final String READER = "authz-reader@citi.com";
  private static final String STRANGER = "authz-stranger@citi.com";
  private static final String CONTRIBUTOR = "authz-contributor@citi.com";
  private static final String DRAFT_STEP = "Go to the home page";
  private static final String TOKEN = "test-service-identity-token";

  /** AC-20: a failure injected after the handler's work, so the ack ordering is decidable. */
  static final AtomicBoolean FAIL_COMMIT = new AtomicBoolean(false);

  @TestConfiguration
  static class CommitFailureHook {

    @Bean
    ProgressReportService.ReportCommitHook failingCommitHook() {
      return executionId -> {
        if (FAIL_COMMIT.get()) {
          throw new IllegalStateException("injected commit failure");
        }
      };
    }
  }

  @org.springframework.boot.test.web.server.LocalServerPort private int port;

  /**
   * A raw JDK client for the internal routes.
   *
   * <p>{@code TestRestTemplate} is built on {@code HttpURLConnection}, whose built-in
   * authentication handling turns a {@code 401} on a streamed request body into "cannot retry due
   * to server authentication" rather than a response. That is a property of the test client and not
   * of the service, and it would have hidden every {@code 401} this criterion is about.
   */
  private final HttpClient internalClient =
      HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();

  @Autowired private TestRestTemplate restTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private StudioService studioService;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private TransactionTemplate transactions;

  private StudioExecutionFixtures fixtures;
  private UUID testId;
  private UUID otherCsiTestId;
  private UUID executionId;
  private UUID otherCsiExecutionId;

  @BeforeEach
  void setUp() {
    FAIL_COMMIT.set(false);
    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedUser(READER);
    fixtures.seedUser(STRANGER);
    fixtures.seedUser(CONTRIBUTOR);
    fixtures.seedCsi(CSI_ID, OWNER);
    fixtures.seedCsi(OTHER_CSI_ID, OWNER);
    jdbc.update("DELETE FROM studio_dispatch_ledger WHERE csi_id IN (?, ?)", CSI_ID, OTHER_CSI_ID);
    testId =
        fixtures
            .seedRunnableTest("Authz draft", CSI_ID, OWNER, List.of("Go to the home page"))
            .testId();
    otherCsiTestId =
        fixtures
            .seedRunnableTest("Other CSI draft", OTHER_CSI_ID, OWNER, List.of("Go home"))
            .testId();
    executionId =
        studioService
            .executeTest(testId, StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner"), null)
            .executionId();
    otherCsiExecutionId =
        studioService
            .executeTest(
                otherCsiTestId,
                StudioExecutionFixtures.identity(OWNER, OTHER_CSI_ID, "owner"),
                null)
            .executionId();
  }

  // ── AC-4a: readers, owners and the boundaries between them ───────────────

  @Test
  void aReaderMayReadAndMayNotExecute() {
    assertThat(get("/api/v1/studio/tests/" + testId, reader()).getStatusCode().value())
        .isEqualTo(200);
    assertThat(get("/api/v1/studio/executions/" + executionId, reader()).getStatusCode().value())
        .isEqualTo(200);
    assertThat(
            post("/api/v1/studio/tests/" + testId + "/execute", reader()).getStatusCode().value())
        .as("only owners and explicitly authorized administrators may execute")
        .isEqualTo(403);
  }

  @Test
  void anOwnerMayExecute() {
    assertThat(post("/api/v1/studio/tests/" + testId + "/execute", owner()).getStatusCode().value())
        .isEqualTo(202);
  }

  @Test
  void aCrossCsiTestIdAndACrossCsiExecutionIdAreBothRefusedWithoutDisclosingExistence() {
    ResponseEntity<String> crossTest = get("/api/v1/studio/tests/" + otherCsiTestId, reader());
    ResponseEntity<String> crossExecution =
        get("/api/v1/studio/executions/" + otherCsiExecutionId, reader());
    ResponseEntity<String> absent = get("/api/v1/studio/tests/" + UUID.randomUUID(), reader());
    ResponseEntity<String> absentExecution =
        get("/api/v1/studio/executions/" + UUID.randomUUID(), reader());

    assertThat(crossTest.getStatusCode().value()).isEqualTo(403);
    assertThat(crossExecution.getStatusCode().value()).isEqualTo(403);
    assertThat(absent.getStatusCode().value())
        .as("no 404-shaped answer is reachable")
        .isEqualTo(403);
    assertThat(absentExecution.getStatusCode().value()).isEqualTo(403);
    assertThat(crossTest.getBody())
        .as("a 403 must not disclose existence: the two answers are identical")
        .isEqualTo(absent.getBody());
    assertThat(crossExecution.getBody()).isEqualTo(absentExecution.getBody());
    assertThat(crossTest.getBody())
        .doesNotContain(otherCsiTestId.toString())
        .doesNotContain("Other CSI");
  }

  @Test
  void anIdentityWithNoOwnershipAtAllSeesNothing() {
    assertThat(get("/api/v1/studio/tests/" + testId, stranger()).getStatusCode().value())
        .isEqualTo(403);
    assertThat(get("/api/v1/studio/executions/" + executionId, stranger()).getStatusCode().value())
        .isEqualTo(403);
  }

  @Test
  void listsAreScopedBeforePagingSoPageCountsNeverDescribeRowsTheCallerCannotSee()
      throws Exception {
    JsonNode tests = json(get("/api/v1/studio/tests", reader()));
    JsonNode executions = json(get("/api/v1/studio/executions", reader()));

    assertThat(tests.path("data").toString()).contains(testId.toString());
    assertThat(tests.path("data").toString()).doesNotContain(otherCsiTestId.toString());
    assertThat(tests.path("totalElements").asLong())
        .as("scoping is part of the query, so the count describes the scoped set")
        .isEqualTo(tests.path("data").size());
    assertThat(executions.path("data").toString()).contains(executionId.toString());
    assertThat(executions.path("data").toString()).doesNotContain(otherCsiExecutionId.toString());
    assertThat(executions.path("totalElements").asLong()).isEqualTo(executions.path("data").size());
  }

  @Test
  void historyStaysReadableForASoftDeletedTestBecauseItIsKeyedOnTheExecutionsOwnCsi() {
    jdbc.update("UPDATE ui_tests SET deleted_at = NOW() WHERE id = ?", testId);

    assertThat(get("/api/v1/studio/executions/" + executionId, reader()).getStatusCode().value())
        .as("historical access uses the execution's own immutable csi_id, not a parent lookup")
        .isEqualTo(200);
    assertThat(get("/api/v1/studio/tests/" + testId, reader()).getStatusCode().value())
        .isEqualTo(403);
  }

  @Test
  void aQuarantinedExecutionWithNoCsiIsUnreadableByEveryoneIncludingAdministrators() {
    jdbc.update("UPDATE ui_test_executions SET csi_id = NULL WHERE id = ?", executionId);

    assertThat(get("/api/v1/studio/executions/" + executionId, admin()).getStatusCode().value())
        .isEqualTo(403);
  }

  // ── AC-6a: the /internal/** chain ────────────────────────────────────────

  @Test
  void bothCallbacksAreUnreachableWithoutServiceIdentity() {
    assertThat(postInternal("/admission", null, "{}").statusCode()).isEqualTo(401);
    assertThat(postInternal("/progress", null, "{}").statusCode()).isEqualTo(401);
  }

  @Test
  void aBlankMalformedOrWrongCredentialIsRefusedBeforeAnyHandlerWork() {
    assertThat(postInternal("/admission", "", "{}").statusCode()).isEqualTo(401);
    assertThat(postInternal("/admission", "not-a-bearer-scheme", "{}").statusCode()).isEqualTo(401);
    assertThat(postInternal("/admission", "Bearer ", "{}").statusCode()).isEqualTo(401);
    assertThat(postInternal("/admission", "Bearer wrong-token", "{}").statusCode()).isEqualTo(403);
  }

  @Test
  void theRejectionBodyCarriesACodeAndNoExecutionDetail() {
    HttpResponse<String> refused =
        postInternal("/admission", null, "{\"executionId\":\"" + executionId + "\"}");

    assertThat(refused.statusCode()).isEqualTo(401);
    assertThat(refused.body())
        .contains("SERVICE_IDENTITY_REQUIRED")
        .doesNotContain(executionId.toString())
        .doesNotContain("PENDING")
        .doesNotContain(TOKEN);
  }

  @Test
  void theCredentialIsNotAcceptedFromAurlOrAQueryParameter() {
    HttpResponse<String> viaQuery =
        postInternalPath(
            "/internal/studio/executions/" + executionId + "/admission?access_token=" + TOKEN,
            null,
            "{}");

    assertThat(viaQuery.statusCode())
        .as("the credential is read from the Authorization header and from nowhere else")
        .isEqualTo(401);
  }

  @Test
  void theInternalOperationsAreAbsentFromThePublicSpringdocSurface() throws Exception {
    JsonNode document =
        objectMapper.readTree(restTemplate.getForObject("/v3/api-docs", String.class));

    List<String> paths = new java.util.ArrayList<>();
    document.path("paths").fieldNames().forEachRemaining(paths::add);

    assertThat(paths).isNotEmpty();
    assertThat(paths).noneMatch(path -> path.startsWith("/internal/"));
  }

  @Test
  void aValidServiceIdentityReachesTheHandler() {
    // A well-formed but stale admission: the chain let it through, and the handler answered on
    // the merits. What matters here is that the answer came from the handler and not from the
    // chain — 409 is a handler verdict; 401/403 would not be.
    HttpResponse<String> answered =
        postInternal(
            "/admission",
            "Bearer " + TOKEN,
            "{\"executionId\":\""
                + executionId
                + "\",\"attemptId\":\""
                + UUID.randomUUID()
                + "\",\"runnerInstanceId\":\"studio-runner-0\",\"admissionId\":\""
                + UUID.randomUUID()
                + "\",\"runtimeVersions\":{}}");

    assertThat(answered.statusCode()).isEqualTo(409);
    assertThat(answered.body()).contains("ATTEMPT_SUPERSEDED");
  }

  // ── AC-24 / AC-26 at the wire boundary ───────────────────────────────────

  @Test
  void aFieldTheClosedSchemaDoesNotNameIsA400() {
    HttpResponse<String> refused =
        postInternal(
            "/admission",
            "Bearer " + TOKEN,
            "{\"executionId\":\""
                + executionId
                + "\",\"attemptId\":\""
                + UUID.randomUUID()
                + "\",\"runnerInstanceId\":\"studio-runner-0\",\"admissionId\":\""
                + UUID.randomUUID()
                + "\",\"runtimeVersions\":{},\"recordingOriginMs\":1234}");

    assertThat(refused.statusCode())
        .as("an open schema over a wire body is not a contract (ADR-002 §6.2)")
        .isEqualTo(400);
  }

  @Test
  void aBodyOverTheCallbackBoundIsA413AndChangesNothing() {
    StringBuilder huge = new StringBuilder("{\"executionId\":\"" + executionId + "\",\"pad\":\"");
    huge.append("x".repeat(300_000)).append("\"}");

    HttpResponse<String> refused = postInternal("/progress", "Bearer " + TOKEN, huge.toString());

    assertThat(refused.statusCode()).isEqualTo(413);
    assertThat(refused.body()).contains("REPORT_TOO_LARGE");
  }

  // ── AC-20: the acknowledgement is sent only after commit ─────────────────

  @Test
  void aCommitFailureInjectedAfterTheHandlersWorkYieldsANonSuccess() {
    UUID attemptId = dispatch(executionId);
    UUID admissionId = UUID.randomUUID();
    assertThat(admit(attemptId, admissionId).statusCode()).isEqualTo(200);

    FAIL_COMMIT.set(true);
    HttpResponse<String> failed = started(attemptId, admissionId, 1);
    FAIL_COMMIT.set(false);

    assertThat(failed.statusCode() >= 200 && failed.statusCode() < 300)
        .as("an acknowledgement sent before the commit would lose a terminal result on a crash")
        .isFalse();
    assertThat(
            jdbc.queryForObject(
                "SELECT status FROM ui_test_executions WHERE id = ?", String.class, executionId))
        .as("and nothing was persisted")
        .isEqualTo("PENDING");
  }

  @Test
  void theAcknowledgementIsNeverObservedBeforeTheRowIsVisibleToAnIndependentConnection() {
    UUID attemptId = dispatch(executionId);
    UUID admissionId = UUID.randomUUID();
    admit(attemptId, admissionId);

    HttpResponse<String> ack = started(attemptId, admissionId, 1);

    assertThat(ack.statusCode()).isEqualTo(200);
    // The response is in hand. An independent connection — a different pool entry, its own
    // transaction — must already see the committed row.
    assertThat(
            jdbc.queryForObject(
                "SELECT status FROM ui_test_executions WHERE id = ?", String.class, executionId))
        .isEqualTo("RUNNING");
  }

  // ── Story 10.30 (ADR-002 O-18, §27): write authorization on create, save and delete ──
  //
  // Written first, against the code as it stood before the fix (ADR-002 §27.3: "@qa writes the
  // failing test first"). The refusals below were red on purpose at that commit and the controls
  // were green; the story's Dev Agent Record and QA Results hold the observed run. Every refusal
  // asserts the row from the database, never from the response.

  /**
   * AC-2, {@code PUT} half: three identities without write on the draft's CSI — a viewer, a
   * contributor (the closest role to a writer: READ_ROLES holds it, WRITE_ROLES does not) and an
   * identity with no ownership at all — are refused {@code 403}, and the row is byte-unchanged.
   *
   * <p>Each identity gets its own draft, seeded identically, so one identity's outcome cannot shape
   * the next one's. The save body carries the row's current revisions, so a refusal can only be
   * authorization's and never {@code 409 STALE_REVISION}.
   */
  @Test
  void aReaderOrAStrangerMayNotSaveAndTheDraftIsByteUnchanged() {
    SoftAssertions softly = new SoftAssertions();
    for (Caller caller : callersWithoutWrite()) {
      UUID draft = seedWritableDraft("Save refusal (" + caller.label() + ")");
      Map<String, Object> before = rowState(draft);
      String beforeImage = rowImage(draft);

      ResponseEntity<String> refused =
          put(
              draft,
              saveBody(draft, "Renamed by " + caller.label(), "Edited by " + caller.label()),
              caller.headers());

      softly
          .assertThat(refused.getStatusCode().value())
          .as("%s: PUT on a draft whose CSI it may not write (body: %s)", caller, refused.getBody())
          .isEqualTo(403);
      softly
          .assertThat(refused.getBody())
          .as("%s: the refusal is the one Studio code", caller)
          .contains(StudioAccessDeniedException.CODE);
      softly
          .assertThat(rowState(draft))
          .as("%s: the five named columns, read from the database", caller)
          .isEqualTo(before);
      softly
          .assertThat(rowImage(draft))
          .as("%s: the whole row, read from the database", caller)
          .isEqualTo(beforeImage);
    }
    softly.assertAll();
  }

  /** AC-2, {@code DELETE} half: the same three identities, the same byte-unchanged row. */
  @Test
  void aReaderOrAStrangerMayNotDeleteAndTheDraftIsByteUnchanged() {
    SoftAssertions softly = new SoftAssertions();
    for (Caller caller : callersWithoutWrite()) {
      UUID draft = seedWritableDraft("Delete refusal (" + caller.label() + ")");
      Map<String, Object> before = rowState(draft);
      String beforeImage = rowImage(draft);

      ResponseEntity<String> refused = delete(draft, caller.headers());

      softly
          .assertThat(refused.getStatusCode().value())
          .as(
              "%s: DELETE on a draft whose CSI it may not write (body: %s)",
              caller, refused.getBody())
          .isEqualTo(403);
      softly
          .assertThat(refused.getBody())
          .as("%s: the refusal is the one Studio code", caller)
          .contains(StudioAccessDeniedException.CODE);
      softly
          .assertThat(rowState(draft))
          .as("%s: deleted_at and the other named columns, read from the database", caller)
          .isEqualTo(before);
      softly
          .assertThat(rowImage(draft))
          .as("%s: the whole row, read from the database", caller)
          .isEqualTo(beforeImage);
    }
    softly.assertAll();
  }

  /**
   * AC-3 and AC-9. One caller owns {@code OTHER_CSI_ID} and only views {@code CSI_ID}.
   *
   * <ul>
   *   <li>AC-3 deny: creating on {@code CSI_ID} (registered, not writable) is {@code 403} and no
   *       row is created, counted in the database.
   *   <li>AC-3 control: the same caller creating on {@code OTHER_CSI_ID} is {@code 201}, so the
   *       deny is not a route that refuses everyone.
   *   <li>AC-9: the same caller — not an administrator, no write on the id — creating on an
   *       unregistered CSI is {@code 400}, not {@code 403}: the registered-CSI check runs first.
   * </ul>
   */
  @Test
  void creatingOnARegisteredCsiTheCallerMayNotWriteIsForbiddenAndCreatesNoRow() {
    HttpHeaders caller = identity(READER, "", OTHER_CSI_ID + ":owner," + CSI_ID + ":viewer");
    SoftAssertions softly = new SoftAssertions();

    String deniedName = "Create refusal " + UUID.randomUUID();
    ResponseEntity<String> denied =
        post("/api/v1/studio/tests", createBody(deniedName, CSI_ID), caller);
    softly
        .assertThat(denied.getStatusCode().value())
        .as("AC-3: POST on a registered CSI the caller may not write (body: %s)", denied.getBody())
        .isEqualTo(403);
    softly.assertThat(denied.getBody()).contains(StudioAccessDeniedException.CODE);
    softly
        .assertThat(rowsNamed(deniedName))
        .as("AC-3: no ui_tests row was created, counted in the database")
        .isZero();

    String ownName = "Create control " + UUID.randomUUID();
    ResponseEntity<String> created =
        post("/api/v1/studio/tests", createBody(ownName, OTHER_CSI_ID), caller);
    softly
        .assertThat(created.getStatusCode().value())
        .as(
            "AC-3 control: the same caller creates on the CSI it owns (body: %s)",
            created.getBody())
        .isEqualTo(201);
    softly.assertThat(rowsNamed(ownName)).as("AC-3 control: exactly one row").isEqualTo(1);

    String unregistered = "U" + (10_000_000 + (int) (Math.random() * 89_999_999));
    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM csi_systems WHERE id = ?", Integer.class, unregistered))
        .as("fixture: the id really is unregistered")
        .isZero();
    String unregisteredName = "Create unregistered " + UUID.randomUUID();
    ResponseEntity<String> malformed =
        post("/api/v1/studio/tests", createBody(unregisteredName, unregistered), caller);
    softly
        .assertThat(malformed.getStatusCode().value())
        .as(
            "AC-9: a non-administrator's POST on an unregistered CSI is answered by the"
                + " registered-CSI check, before authorization (body: %s)",
            malformed.getBody())
        .isEqualTo(400);
    softly.assertThat(rowsNamed(unregisteredName)).isZero();
    softly.assertAll();
  }

  /**
   * AC-4: {@code PUT} on an unknown id, a soft-deleted draft and a quarantined draft, as an
   * administrator, is {@code 403} in all three cases with byte-identical bodies. The administrator
   * first saves each draft successfully (a name-only save, which moves no revision and enqueues no
   * compile), so each {@code 403} belongs to the row's state and not to the fixture.
   */
  @Test
  void putOnAnUnknownSoftDeletedOrQuarantinedDraftIsForbiddenEvenToAnAdministrator() {
    UUID softDeleted = seedWritableDraft("Withheld save (soft-deleted)");
    UUID quarantined = seedWritableDraft("Withheld save (quarantined)");
    UUID unknown = UUID.randomUUID();

    for (UUID draft : List.of(softDeleted, quarantined)) {
      ResponseEntity<String> control =
          put(draft, saveBody(draft, "Administrator control", DRAFT_STEP), admin());
      assertThat(control.getStatusCode().value())
          .as(
              "control: the administrator reaches the save on this row (body: %s)",
              control.getBody())
          .isEqualTo(200);
      assertThat(revisions(draft))
          .as("control: the name-only save moved no revision")
          .isEqualTo(List.of(1L, 1L));
    }
    jdbc.update("UPDATE ui_tests SET deleted_at = NOW() WHERE id = ?", softDeleted);
    jdbc.update("UPDATE ui_tests SET quarantined_at = NOW() WHERE id = ?", quarantined);
    String softDeletedImage = rowImage(softDeleted);
    String quarantinedImage = rowImage(quarantined);

    ResponseEntity<String> onUnknown =
        put(unknown, saveBody(1L, 1L, "Administrator save", "Edited"), admin());
    ResponseEntity<String> onSoftDeleted =
        put(softDeleted, saveBody(softDeleted, "Administrator save", "Edited"), admin());
    ResponseEntity<String> onQuarantined =
        put(quarantined, saveBody(quarantined, "Administrator save", "Edited"), admin());

    SoftAssertions softly = new SoftAssertions();
    assertWithheld(softly, "PUT unknown", onUnknown);
    assertWithheld(softly, "PUT soft-deleted", onSoftDeleted);
    assertWithheld(softly, "PUT quarantined", onQuarantined);
    softly
        .assertThat(onSoftDeleted.getBody())
        .as("byte-identical bodies: soft-deleted vs unknown")
        .isEqualTo(onUnknown.getBody());
    softly
        .assertThat(onQuarantined.getBody())
        .as("byte-identical bodies: quarantined vs unknown")
        .isEqualTo(onUnknown.getBody());
    softly.assertThat(rowImage(softDeleted)).as("nothing written").isEqualTo(softDeletedImage);
    softly.assertThat(rowImage(quarantined)).as("nothing written").isEqualTo(quarantinedImage);
    softly.assertAll();
  }

  /**
   * AC-5: {@code DELETE} on the same three states, as the same administrator, is {@code 403} in all
   * three with byte-identical bodies, and nothing is written.
   *
   * <p>The controls: for the soft-deleted case the administrator's own successful {@code DELETE} is
   * what puts the row into that state, so the second {@code DELETE} is the one under test and must
   * not bump {@code deleted_at}. For the quarantined case a successful {@code DELETE} would itself
   * change the state, so the control is the administrator's successful {@code GET} of the same row
   * through the same visibility-restricted read, taken before the quarantine.
   */
  @Test
  void deleteOnAnUnknownSoftDeletedOrQuarantinedDraftIsForbiddenEvenToAnAdministrator() {
    UUID softDeleted = seedWritableDraft("Withheld delete (soft-deleted)");
    UUID quarantined = seedWritableDraft("Withheld delete (quarantined)");
    UUID unknown = UUID.randomUUID();

    ResponseEntity<String> deleteControl = delete(softDeleted, admin());
    assertThat(deleteControl.getStatusCode().value())
        .as(
            "control: the administrator reaches the delete on this row (body: %s)",
            deleteControl.getBody())
        .isEqualTo(204);
    assertThat(deletedAt(softDeleted)).as("control: and it was deleted").isNotNull();

    ResponseEntity<String> readControl = get("/api/v1/studio/tests/" + quarantined, admin());
    assertThat(readControl.getStatusCode().value())
        .as("control: the administrator reaches this row before it is quarantined")
        .isEqualTo(200);
    jdbc.update("UPDATE ui_tests SET quarantined_at = NOW() WHERE id = ?", quarantined);
    String softDeletedImage = rowImage(softDeleted);
    String quarantinedImage = rowImage(quarantined);

    ResponseEntity<String> onUnknown = delete(unknown, admin());
    ResponseEntity<String> onSoftDeleted = delete(softDeleted, admin());
    ResponseEntity<String> onQuarantined = delete(quarantined, admin());

    SoftAssertions softly = new SoftAssertions();
    assertWithheld(softly, "DELETE unknown", onUnknown);
    assertWithheld(softly, "DELETE soft-deleted", onSoftDeleted);
    assertWithheld(softly, "DELETE quarantined", onQuarantined);
    softly
        .assertThat(onSoftDeleted.getBody())
        .as("byte-identical bodies: soft-deleted vs unknown")
        .isEqualTo(onUnknown.getBody());
    softly
        .assertThat(onQuarantined.getBody())
        .as("byte-identical bodies: quarantined vs unknown")
        .isEqualTo(onUnknown.getBody());
    softly
        .assertThat(rowImage(softDeleted))
        .as("no second deleted_at bump, nothing else written")
        .isEqualTo(softDeletedImage);
    softly.assertThat(rowImage(quarantined)).as("nothing written").isEqualTo(quarantinedImage);
    softly.assertAll();
  }

  /**
   * AC-6, the non-vacuity control (ADR-002 §27.5): the owner saves and deletes a draft seeded
   * exactly as AC-2's are, so AC-2's {@code 403}s cannot be satisfied by every request failing.
   */
  @Test
  void theOwnerMaySaveAndDeleteTheirOwnDraft() {
    UUID draft = seedWritableDraft("Owner control");

    ResponseEntity<String> saved =
        put(draft, saveBody(draft, "Saved by the owner", "Edited by the owner"), owner());
    assertThat(saved.getStatusCode().value())
        .as("the owner saves (body: %s)", saved.getBody())
        .isEqualTo(200);
    assertThat(revisions(draft).get(0))
        .as("and the save reached the row: the step edit moved sourceRevision")
        .isEqualTo(2L);

    ResponseEntity<String> deleted = delete(draft, owner());
    assertThat(deleted.getStatusCode().value())
        .as("the owner deletes (body: %s)", deleted.getBody())
        .isEqualTo(204);
    assertThat(deletedAt(draft)).as("and the delete reached the row").isNotNull();
  }

  /**
   * AC-7: a save with no revisions, sent by an identity with no write on the draft's CSI, is {@code
   * 400} and not {@code 403} — the request-shape check runs before authorization — and the row is
   * unchanged.
   */
  @Test
  void aMalformedSaveIsRejectedBeforeAuthorizationEvenForACallerWithNoWriteAccess()
      throws Exception {
    UUID draft = seedWritableDraft("Malformed save");
    String beforeImage = rowImage(draft);

    ResponseEntity<String> refused =
        put(draft, saveBody(null, null, "No revisions", "Edited"), stranger());

    assertThat(refused.getStatusCode().value()).as("body: %s", refused.getBody()).isEqualTo(400);
    assertThat(json(refused).path("message").asText()).contains("sourceRevision");
    assertThat(rowImage(draft)).isEqualTo(beforeImage);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /** An identity whose outcome is being asserted, labelled for the failure message. */
  private record Caller(String label, HttpHeaders headers) {
    @Override
    public String toString() {
      return label;
    }
  }

  /** AC-2's three identities: viewer, contributor, and no ownership at all. */
  private static List<Caller> callersWithoutWrite() {
    return List.of(
        new Caller("viewer", reader()),
        new Caller("contributor", contributor()),
        new Caller("stranger", stranger()));
  }

  /**
   * A draft on {@code CSI_ID} in a state a successful save visibly changes: confirmed, {@code
   * READY}, with a candidate. A save that moves a revision returns it to {@code STALE} and clears
   * the candidate (Architecture §4.2).
   */
  private UUID seedWritableDraft(String name) {
    StudioExecutionFixtures.RunnableTest draft =
        fixtures.seedRunnableTest(name, CSI_ID, OWNER, List.of(DRAFT_STEP));
    jdbc.update(
        "UPDATE ui_tests SET compile_status = 'READY', current_candidate_revision_id = ?"
            + " WHERE id = ?",
        draft.revisionId(),
        draft.testId());
    return draft.testId();
  }

  /** The five columns AC-2 names, read directly from the database. */
  private Map<String, Object> rowState(UUID id) {
    return jdbc.queryForMap(
        "SELECT source_revision, configuration_revision, deleted_at, compile_status,"
            + " current_candidate_revision_id FROM ui_tests WHERE id = ?",
        id);
  }

  /** The whole row as text, read directly from the database, so "byte-unchanged" is literal. */
  private String rowImage(UUID id) {
    return jdbc.queryForObject(
        "SELECT row_to_json(t)::text FROM ui_tests t WHERE t.id = ?", String.class, id);
  }

  private List<Long> revisions(UUID id) {
    return jdbc.queryForObject(
        "SELECT source_revision, configuration_revision FROM ui_tests WHERE id = ?",
        (rs, row) -> List.of(rs.getLong(1), rs.getLong(2)),
        id);
  }

  private Instant deletedAt(UUID id) {
    return jdbc.queryForObject(
        "SELECT deleted_at FROM ui_tests WHERE id = ?",
        (rs, row) -> {
          java.sql.Timestamp at = rs.getTimestamp(1);
          return at == null ? null : at.toInstant();
        },
        id);
  }

  private int rowsNamed(String name) {
    return jdbc.queryForObject("SELECT COUNT(*) FROM ui_tests WHERE name = ?", Integer.class, name);
  }

  private static void assertWithheld(
      SoftAssertions softly, String label, ResponseEntity<String> response) {
    softly
        .assertThat(response.getStatusCode().value())
        .as("%s as an administrator: never 400, never 404 (body: %s)", label, response.getBody())
        .isEqualTo(403);
    softly.assertThat(response.getBody()).as(label).contains(StudioAccessDeniedException.CODE);
  }

  /** A save carrying the row's current revisions, so only authorization can refuse it. */
  private String saveBody(UUID id, String name, String step) {
    List<Long> current = revisions(id);
    return saveBody(current.get(0), current.get(1), name, step);
  }

  /**
   * A save in the typed shape, with the seeded draft's configuration, so only the name and the step
   * text can differ from the stored row. {@code null} revisions are omitted from the body.
   */
  private static String saveBody(
      Long sourceRevision, Long configurationRevision, String name, String step) {
    StringBuilder body =
        new StringBuilder("{\"name\":\"")
            .append(name)
            .append("\",\"description\":null,\"csiId\":\"")
            .append(CSI_ID)
            .append("\",\"environment\":\"Production\",\"steps\":[\"")
            .append(step)
            .append("\"],\"variables\":[],")
            .append("\"configuration\":{\"browser\":\"chromium\",")
            .append("\"viewport\":{\"width\":1920,\"height\":1080},")
            .append("\"timeoutSeconds\":30,\"waitStrategy\":\"networkidle\"}");
    if (sourceRevision != null) {
      body.append(",\"sourceRevision\":").append(sourceRevision);
    }
    if (configurationRevision != null) {
      body.append(",\"configurationRevision\":").append(configurationRevision);
    }
    return body.append('}').toString();
  }

  /** A create with no steps, so no compile is enqueued by a create that succeeds. */
  private static String createBody(String name, String csiId) {
    return "{\"name\":\""
        + name
        + "\",\"description\":\"authz\",\"csiId\":\""
        + csiId
        + "\",\"environment\":\"Production\",\"steps\":[],\"variables\":[],"
        + "\"configuration\":{\"browser\":\"chromium\","
        + "\"viewport\":{\"width\":1920,\"height\":1080},"
        + "\"timeoutSeconds\":30,\"waitStrategy\":\"networkidle\"}}";
  }

  private ResponseEntity<String> put(UUID id, String body, HttpHeaders headers) {
    return restTemplate.exchange(
        "/api/v1/studio/tests/" + id,
        HttpMethod.PUT,
        new HttpEntity<>(body, headers),
        String.class);
  }

  private ResponseEntity<String> delete(UUID id, HttpHeaders headers) {
    return restTemplate.exchange(
        "/api/v1/studio/tests/" + id, HttpMethod.DELETE, new HttpEntity<>(headers), String.class);
  }

  private ResponseEntity<String> post(String path, String body, HttpHeaders headers) {
    return restTemplate.exchange(
        path, HttpMethod.POST, new HttpEntity<>(body, headers), String.class);
  }

  private UUID dispatch(UUID execution) {
    UUID attempt = UUID.randomUUID();
    transactions.executeWithoutResult(
        status -> {
          statements.claim(
              execution, "authz-dispatcher", Instant.now().plusSeconds(60), Instant.now());
          statements.beginDispatch(execution, "authz-dispatcher", attempt);
        });
    return attempt;
  }

  private HttpResponse<String> admit(UUID attemptId, UUID admissionId) {
    return postInternal(
        "/admission",
        "Bearer " + TOKEN,
        "{\"executionId\":\""
            + executionId
            + "\",\"attemptId\":\""
            + attemptId
            + "\",\"runnerInstanceId\":\"studio-runner-0\",\"admissionId\":\""
            + admissionId
            + "\",\"runtimeVersions\":{}}");
  }

  private HttpResponse<String> started(UUID attemptId, UUID admissionId, long sequence) {
    String body =
        "{\"executionId\":\""
            + executionId
            + "\",\"attemptId\":\""
            + attemptId
            + "\",\"admissionId\":\""
            + admissionId
            + "\",\"runnerInstanceId\":\"studio-runner-0\",\"kind\":\"STARTED\","
            + "\"runnerSequence\":"
            + sequence
            + ",\"reportedAt\":\"2026-09-10T10:00:02Z\","
            + "\"browserStartedAt\":\"2026-09-10T10:00:02Z\",\"steps\":[],"
            + "\"logs\":[{\"atMs\":0,\"level\":\"info\",\"message\":\"browser started\"}],"
            + "\"logsTruncated\":false,\"runtimeVersions\":{},\"outcome\":null,\"evidence\":null}";
    return postInternal("/progress", "Bearer " + TOKEN, body);
  }

  private HttpResponse<String> postInternal(String suffix, String authorization, String body) {
    return postInternalPath(
        "/internal/studio/executions/" + executionId + suffix, authorization, body);
  }

  private HttpResponse<String> postInternalPath(String path, String authorization, String body) {
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body));
    if (authorization != null) {
      request.header("Authorization", authorization);
    }
    try {
      return internalClient.send(request.build(), HttpResponse.BodyHandlers.ofString());
    } catch (Exception e) {
      throw new AssertionError("the internal route could not be called", e);
    }
  }

  private ResponseEntity<String> get(String path, HttpHeaders headers) {
    return restTemplate.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), String.class);
  }

  private ResponseEntity<String> post(String path, HttpHeaders headers) {
    return restTemplate.exchange(
        path, HttpMethod.POST, new HttpEntity<>("", headers), String.class);
  }

  private JsonNode json(ResponseEntity<String> response) throws Exception {
    return objectMapper.readTree(response.getBody());
  }

  private static HttpHeaders jsonHeaders() {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    return headers;
  }

  /** An identity supplied through the gateway header path the BFF filter already implements. */
  private static HttpHeaders identity(String email, String roles, String ownership) {
    HttpHeaders headers = jsonHeaders();
    headers.set("X-User-Id", "uid-" + email);
    headers.set("X-User-Email", email);
    headers.set("X-User-Roles", roles);
    headers.set("X-User-Csi-Ownership", ownership);
    return headers;
  }

  private static HttpHeaders owner() {
    return identity(OWNER, "", CSI_ID + ":owner");
  }

  private static HttpHeaders reader() {
    return identity(READER, "", CSI_ID + ":viewer");
  }

  /** Story 10.30 AC-2: a reader-tier role that is the closest to a writer, and still not one. */
  private static HttpHeaders contributor() {
    return identity(CONTRIBUTOR, "", CSI_ID + ":contributor");
  }

  private static HttpHeaders stranger() {
    return identity(STRANGER, "", "");
  }

  private static HttpHeaders admin() {
    return identity(OWNER, "checks-admin", "");
  }
}
