package com.citi.put.checks.studio.scheduling;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.reset;

import com.citi.put.checks.studio.StudioAccessDeniedException;
import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.DispatchAuthorization;
import com.citi.put.checks.studio.dispatch.ReferenceDeclarations;
import com.citi.put.checks.studio.dispatch.StudioAcceptanceService;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorizer;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Private real PostgreSQL: retained identity anchors never contaminate shared suite fixtures. */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "studio.scheduling.enabled=true", "studio.scheduling.local-grants-enabled=true",
      "checks.scheduling.dispatcher-enabled=false", "checks.scheduling.retry-enabled=false"
    })
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Import(ObservedPublicationFixture.FreshAuthority.class)
class StudioScheduleApiIT {

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  @Container
  static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>("postgres:15-alpine");

  @DynamicPropertySource
  static void datasource(DynamicPropertyRegistry registry) {
    // Zonky's listener initializes Spring before Testcontainers' beforeAll callback on this repo.
    if (!DATABASE.isRunning()) {
      DATABASE.start();
    }
    registry.add("spring.datasource.url", DATABASE::getJdbcUrl);
    registry.add("spring.datasource.username", DATABASE::getUsername);
    registry.add("spring.datasource.password", DATABASE::getPassword);
    registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
  }

  static class MutableClock extends Clock {
    private volatile Instant now = Instant.parse("2026-10-06T00:00:00Z");

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return now;
    }

    void set(Instant value) {
      now = value;
    }
  }

  @TestConfiguration
  static class TimeConfiguration {
    @Bean
    @Primary
    MutableClock schedulingTestClock() {
      return new MutableClock();
    }
  }

  private static final AtomicInteger SEQUENCE = new AtomicInteger(70000);
  private static final String OWNER = "schedule-owner@citi.com";
  private static final String PRINCIPAL = "studio-local";
  @Autowired JdbcTemplate jdbc;
  @Autowired StudioScheduleService service;
  @Autowired StudioScheduleProcessor processor;
  @Autowired StudioSchedulingProperties properties;
  @Autowired StudioService studio;
  @Autowired StudioAcceptanceService acceptance;
  @Autowired ObservedReplayAuthorizer runAuthority;
  @Autowired StudioDispatchLedgerStatements statements;
  @Autowired DispatchAuthorization dispatchAuthorization;
  @Autowired MutableClock clock;
  @Autowired TransactionTemplate transactions;
  @Autowired TestRestTemplate rest;
  @Autowired ObjectMapper mapper;
  @SpyBean StudioReferenceResolver referenceResolver;
  private UUID testId;
  private UUID revisionId;
  private String csi;
  private Authentication owner;

  @BeforeEach
  void fixture() {
    properties.setEnabled(true);
    properties.setLocalGrantsEnabled(true);
    properties.setBatchSize(20);
    properties.setPerCsiBatchSize(2);
    properties.setPassBudgetMillis(5000);
    reset(referenceResolver);
    clock.set(Instant.parse("2026-10-06T00:00:00Z"));
    csi = Integer.toString(SEQUENCE.incrementAndGet());
    var fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(csi, OWNER);
    List<String> steps = List.of("Go to the home page");
    testId = fixtures.seedTest("Scheduled fixture", csi, OWNER, steps);
    revisionId =
        fixtures.confirmRevision(testId, csi, steps, StudioExecutionFixtures.NO_REFERENCES);
    owner = StudioExecutionFixtures.identity(OWNER, csi, "owner");
    properties.getLocalGrants().put(csi + "|Production", PRINCIPAL);
  }

  /**
   * An explicit manual Run of a learned draft (STUDIO-OBS-012A): fresh Run authority for the owner,
   * then the same acceptance transaction {@code POST /execute} uses.
   */
  private UUID manualRun(UUID test, String key) {
    String testCsi =
        jdbc.queryForObject("SELECT csi_id FROM ui_tests WHERE id = ?", String.class, test);
    var caller = StudioExecutionFixtures.identity(OWNER, testCsi, "owner");
    var grant = runAuthority.authorize(test, caller, ObservedPublicationFixture.request(caller));
    return acceptance.acceptObserved(test, OWNER, key, grant);
  }

  private StudioScheduleDtos.Schedule create() {
    return service.create(
        testId, new StudioScheduleDtos.Create("* * * * *", "UTC", PRINCIPAL), owner);
  }

  private StudioScheduleDtos.Schedule enable() {
    var s = create();
    return service.enabled(
        testId, new StudioScheduleDtos.Enabled(s.version(), true, revisionId, List.of()), owner);
  }

  private void due(StudioScheduleDtos.Schedule s) {
    clock.set(s.nextDueAt());
  }

  private HttpHeaders headers() {
    var h = new HttpHeaders();
    h.setContentType(MediaType.APPLICATION_JSON);
    h.set("X-User-Id", "uid-" + OWNER);
    h.set("X-User-Email", OWNER);
    h.set("X-User-Roles", "");
    h.set("X-User-Csi-Ownership", csi + ":owner");
    return h;
  }

  @Test
  void apiCreateConflictPreviewAndDisabledReadsRemainTruthful() throws Exception {
    String path = "/api/v1/studio/tests/" + testId + "/schedule";
    var response =
        rest.exchange(
            path,
            HttpMethod.POST,
            new HttpEntity<>(
                "{\"cronExpression\":\"*/5 * * *"
                    + " *\",\"timeZone\":\"UTC\",\"executionPrincipal\":\"studio-local\"}",
                headers()),
            String.class);
    assertThat(response.getStatusCode().value()).isEqualTo(201);
    JsonNode data = mapper.readTree(response.getBody());
    assertThat(data.path("state").asText()).isEqualTo("PAUSED");
    var conflict =
        rest.exchange(
            path, HttpMethod.POST, new HttpEntity<>(response.getBody(), headers()), String.class);
    assertThat(conflict.getStatusCode().value()).isEqualTo(409);
    var preview =
        rest.exchange(
            "/api/v1/studio/schedules/preview",
            HttpMethod.POST,
            new HttpEntity<>(
                "{\"cronExpression\":\"*/5 * * * *\",\"timeZone\":\"UTC\"}", headers()),
            String.class);
    assertThat(mapper.readTree(preview.getBody()).path("occurrences")).hasSize(5);
    properties.setEnabled(false);
    assertThat(service.read(testId, owner).state()).isEqualTo("PAUSED");
    assertThat(service.capabilities(testId, owner).enabled()).isFalse();
    assertThatThrownBy(() -> service.remove(testId, 1L, owner))
        .isInstanceOf(StudioScheduleException.class);
  }

  @Test
  void acceptedOccurrenceHasOneImmutableRunAndActivationAcrossResumeAndRecreation() {
    var schedule = enable();
    due(schedule);
    assertThat(processor.process(testId)).isEqualTo("ACCEPTED");
    var occurrence = service.occurrences(testId, 0, 20, owner).data().get(0);
    var run = studio.findExecutionById(occurrence.executionId(), owner);
    assertThat(run.triggerSource()).isEqualTo("SCHEDULED");
    assertThat(run.activationId()).isEqualTo(schedule.activationId());
    assertThat(run.activatedBy()).isEqualTo(OWNER);
    assertThat(run.withTestName("renamed").activationId()).isEqualTo(run.activationId());
    assertThat(run.scheduledAt()).isEqualTo(schedule.nextDueAt());
    assertThat(processor.process(testId)).isNull();
    var current = service.read(testId, owner);
    service.remove(testId, current.version(), owner);
    var recreated = create();
    assertThat(recreated.id()).isEqualTo(schedule.id());
    assertThat(recreated.version()).isGreaterThan(current.version());
    assertThat(studio.findExecutionById(occurrence.executionId(), owner).activatedAt())
        .isEqualTo(schedule.activatedAt());
  }

  @Test
  void replicasRacingAndRollbackCannotCreateDuplicateOrPartialAcceptedWork() throws Exception {
    var s = enable();
    due(s);
    var start = new CountDownLatch(1);
    var a =
        CompletableFuture.supplyAsync(
            () -> {
              await(start);
              return processor.process(testId);
            });
    var b =
        CompletableFuture.supplyAsync(
            () -> {
              await(start);
              return processor.process(testId);
            });
    start.countDown();
    a.get(10, TimeUnit.SECONDS);
    b.get(10, TimeUnit.SECONDS);
    assertThat(service.occurrences(testId, 0, 20, owner).totalElements()).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_dispatch_ledger WHERE test_id=?",
                Integer.class,
                testId))
        .isEqualTo(1);
    // A second distinct test is rolled back after the complete processor writes, simulating a
    // process failure before the enclosing transaction's commit.
    fixture();
    s = enable();
    due(s);
    transactions.executeWithoutResult(
        status -> {
          assertThat(processor.process(testId)).isEqualTo("ACCEPTED");
          status.setRollbackOnly();
        });
    assertThat(service.occurrences(testId, 0, 20, owner).totalElements()).isZero();
    assertThat(service.read(testId, owner).nextDueAt()).isEqualTo(s.nextDueAt());
    assertThat(processor.process(testId)).isEqualTo("ACCEPTED");
  }

  /**
   * Story 10.48 AC-7a: schedule create and enable stay {@code canWrite}-gated. A viewer and a
   * contributor (read roles, not write) are refused with the nondisclosing {@code 403}, and nothing
   * is written; the owner's create and enable are the controls.
   */
  @Test
  void aViewerOrAContributorMayNotCreateOrEnableASchedule() {
    for (String role : List.of("viewer", "contributor")) {
      Authentication reader =
          StudioExecutionFixtures.identity("schedule-" + role + "@citi.com", csi, role);
      assertThatThrownBy(
              () ->
                  service.create(
                      testId, new StudioScheduleDtos.Create("* * * * *", "UTC", PRINCIPAL), reader))
          .as("%s: create", role)
          .isInstanceOf(StudioAccessDeniedException.class);
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM studio_schedules WHERE test_id=?", Integer.class, testId))
          .as("%s: no schedule row", role)
          .isZero();
    }
    var created = create();
    for (String role : List.of("viewer", "contributor")) {
      Authentication reader =
          StudioExecutionFixtures.identity("schedule-" + role + "@citi.com", csi, role);
      assertThatThrownBy(
              () ->
                  service.enabled(
                      testId,
                      new StudioScheduleDtos.Enabled(
                          created.version(), true, revisionId, List.of()),
                      reader))
          .as("%s: enable", role)
          .isInstanceOf(StudioAccessDeniedException.class);
      assertThat(service.read(testId, owner).requestedEnabled())
          .as("%s: still paused", role)
          .isFalse();
    }
    assertThat(
            service
                .enabled(
                    testId,
                    new StudioScheduleDtos.Enabled(created.version(), true, revisionId, List.of()),
                    owner)
                .requestedEnabled())
        .as("control: the owner enables")
        .isTrue();
  }

  /**
   * Story 10.48 AC-7b: the manual execute check is not on the scheduled path. An occurrence fires
   * under the schedule's execution principal and its background grant, with no request {@link
   * Authentication} at all, and is still accepted.
   */
  @Test
  void aScheduledOccurrenceIsAcceptedWithNoRequestAuthentication() {
    var schedule = enable();
    due(schedule);
    SecurityContextHolder.clearContext();
    assertThat(SecurityContextHolder.getContext().getAuthentication())
        .as("fixture: no human is in the security context")
        .isNull();

    assertThat(processor.process(testId)).isEqualTo("ACCEPTED");

    var occurrence = service.occurrences(testId, 0, 20, owner).data().get(0);
    assertThat(occurrence.executionId()).isNotNull();
    assertThat(studio.findExecutionById(occurrence.executionId(), owner).triggerSource())
        .isEqualTo("SCHEDULED");
  }

  @Test
  void activeManualWorkSkipsOverlapWithoutChangingManualPermission() {
    var s = enable();
    studio.executeTest(
        testId, owner, "manual-before-due", ObservedPublicationFixture.request(owner));
    due(s);
    assertThat(processor.process(testId)).isEqualTo("OVERLAP");
    assertThat(service.occurrences(testId, 0, 20, owner).data().get(0).executionId()).isNull();
  }

  @Test
  void durableUncertaintyRequiresExactAcknowledgmentAndNeverReplaysOldSlot() {
    UUID manual = manualRun(testId, "uncertain-manual");
    statements.closeWithError(manual, "DISPATCH_UNKNOWN", clock.instant());
    assertThat(
            jdbc.queryForObject(
                "SELECT terminal_error_code FROM studio_dispatch_ledger WHERE execution_id=?",
                String.class,
                manual))
        .isEqualTo("DISPATCH_UNKNOWN");
    var s = create();
    assertThatThrownBy(
            () ->
                service.enabled(
                    testId,
                    new StudioScheduleDtos.Enabled(s.version(), true, revisionId, List.of()),
                    owner))
        .isInstanceOf(StudioConflictException.class);
    var active =
        service.enabled(
            testId,
            new StudioScheduleDtos.Enabled(s.version(), true, revisionId, List.of(manual)),
            owner);
    assertThat(active.unacknowledgedUncertaintyExecutionIds()).isEmpty();
    assertThat(active.nextDueAt()).isAfter(clock.instant());
    // Prune only that execution's history detail; durable ledger and acknowledgment still stand.
    jdbc.update("DELETE FROM ui_test_executions WHERE id=?", manual);
    assertThat(service.read(testId, owner).unacknowledgedUncertaintyExecutionIds()).isEmpty();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_schedule_uncertainty_ack WHERE execution_id=?",
                Integer.class,
                manual))
        .isEqualTo(1);
  }

  /**
   * STUDIO-OBS-012A R1 live port of the deleted compile-era {@code
   * sourceMutationBlocksAndOptionalUnchangedCompileFailureDoesNot}: a source edit blocks an enabled
   * schedule {@code LEARN_REQUIRED} and keeps the owner's request. STUDIO-OBS-009 AC-6 re-pointed
   * it to the lifted contract: the control is now an occurrence that is {@code ACCEPTED} under
   * background authority before the edit, not a refusal. The edit goes through the v2 authoring
   * save because the v1 {@code updateTest} entry point no longer exists (STUDIO-OBS-015 ruling1).
   */
  @Test
  void sourceMutationBlocksTheScheduleWithLearnRequired() {
    var schedule = enable();
    assertThat(service.read(testId, owner).state()).as("control").isEqualTo("ENABLED");
    due(schedule);
    assertThat(processor.process(testId)).as("control: the lifted contract").isEqualTo("ACCEPTED");
    assertThat(service.read(testId, owner).state()).as("control").isEqualTo("ENABLED");
    var draft = studio.findTestById(testId, owner);
    var authoring = studio.findAuthoringV2ById(testId, owner);
    var step = authoring.steps().get(0);
    studio.saveAuthoring(
        testId,
        new AuthoringV2Request(
            2,
            authoring.globalContext(),
            List.of(new AuthoringStep(step.id(), "Go somewhere else", step.context()))),
        draft.sourceRevision(),
        draft.configurationRevision(),
        owner);
    assertThat(service.read(testId, owner).state()).isEqualTo("BLOCKED");
    assertThat(service.read(testId, owner).blockedCode()).isEqualTo("LEARN_REQUIRED");
    assertThat(service.read(testId, owner).requestedEnabled()).isTrue();
  }

  @Test
  void authorizationWithdrawalBeforeAdmissionAndBeforeSendFailsClosed() {
    var s = enable();
    due(s);
    properties.getLocalGrants().remove(csi + "|Production");
    assertThat(processor.process(testId)).isEqualTo("BACKGROUND_AUTHORIZATION_DENIED");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_dispatch_ledger WHERE test_id=?",
                Integer.class,
                testId))
        .isZero();
    fixture();
    s = enable();
    due(s);
    assertThat(processor.process(testId)).isEqualTo("ACCEPTED");
    var accepted = service.occurrences(testId, 0, 20, owner).data().get(0);
    properties.getLocalGrants().remove(csi + "|Production");
    assertThatThrownBy(
            () -> dispatchAuthorization.recheck(accepted.executionId(), testId, csi, PRINCIPAL))
        .isInstanceOf(DispatchAuthorization.AuthorizationRevokedException.class);
  }

  @Test
  void deletionStopsFutureWorkButKeepsAuthorizedOccurrenceAudit() {
    var s = enable();
    due(s);
    assertThat(processor.process(testId)).isEqualTo("ACCEPTED");
    studio.softDeleteTest(testId, owner);
    assertThat(processor.process(testId)).isNull();
    assertThat(service.occurrences(testId, 0, 20, owner).totalElements()).isEqualTo(1);
  }

  @Test
  void capabilityOffDeferralExpiresBeforeAnyCatchupAndLifecycleSettlesPendingAudit() {
    var s = enable();
    due(s);
    // Fill this CSI's existing active bound with real manual accepted work, on another test.
    var f = new StudioExecutionFixtures(jdbc);
    UUID other = f.seedRunnableTest("capacity", csi, OWNER, List.of("Go home")).testId();
    for (int i = 0; i < 20; i++) {
      manualRun(other, "quota-" + i);
    }
    assertThat(processor.process(testId)).isEqualTo("PENDING_QUOTA_EXCEEDED");
    var deferred = service.occurrences(testId, 0, 20, owner).data().get(0);
    assertThat(deferred.decision()).isEqualTo("DEFERRED");
    properties.setEnabled(false);
    clock.set(deferred.graceExpiresAt().plusSeconds(60));
    assertThat(processor.process(testId)).isNull();
    properties.setEnabled(true);
    assertThat(processor.process(testId)).isEqualTo("GRACE_EXPIRED");
    assertThat(service.occurrences(testId, 0, 20, owner).data().get(0).executionId()).isNull();
    assertThat(service.read(testId, owner).nextDueAt()).isAfter(clock.instant());
    // Another still-deferred slot is settled by an explicit pause under the same locks.
    s = service.read(testId, owner);
    due(s);
    assertThat(processor.process(testId)).isEqualTo("PENDING_QUOTA_EXCEEDED");
    var beforePause = service.read(testId, owner);
    service.enabled(
        testId, new StudioScheduleDtos.Enabled(beforePause.version(), false, null, null), owner);
    assertThat(service.occurrences(testId, 0, 20, owner).data().get(0).code())
        .isEqualTo("SCHEDULE_PAUSED");
  }

  @Test
  void graceAndGrantAreRecheckedAfterPreflightBeforeAnyAcceptedWrite() {
    var s = enable();
    due(s);
    doAnswer(
            invocation -> {
              clock.set(clock.instant().plusSeconds(properties.getGraceSeconds() + 1));
              return null;
            })
        .when(referenceResolver)
        .preflight(
            anyString(),
            anyString(),
            any(UUID.class),
            anyString(),
            any(ReferenceDeclarations.class));
    assertThat(processor.process(testId)).isEqualTo("GRACE_EXPIRED");
    var expired = service.occurrences(testId, 0, 20, owner).data().get(0);
    assertThat(expired.decision()).isEqualTo("SKIPPED");
    assertThat(expired.executionId()).isNull();
    fixture();
    s = enable();
    due(s);
    doAnswer(
            invocation -> {
              properties.getLocalGrants().remove(csi + "|Production");
              return null;
            })
        .when(referenceResolver)
        .preflight(
            anyString(),
            anyString(),
            any(UUID.class),
            anyString(),
            any(ReferenceDeclarations.class));
    assertThat(processor.process(testId)).isEqualTo("BACKGROUND_AUTHORIZATION_DENIED");
    assertThat(service.occurrences(testId, 0, 20, owner).data().get(0).executionId()).isNull();
  }

  @Test
  void updateRemovalAndInputInvalidationSettleDeferredWithoutOrphans() {
    for (String mutation : List.of("update", "remove", "input")) {
      fixture();
      var s = enable();
      due(s);
      UUID other =
          new StudioExecutionFixtures(jdbc)
              .seedRunnableTest("quota", csi, OWNER, List.of("Go home"))
              .testId();
      for (int i = 0; i < 20; i++) {
        manualRun(other, "fill-" + other + "-" + i);
      }
      assertThat(processor.process(testId)).isEqualTo("PENDING_QUOTA_EXCEEDED");
      var current = service.read(testId, owner);
      if ("update".equals(mutation)) {
        service.update(
            testId,
            new StudioScheduleDtos.Update(current.version(), "*/5 * * * *", "UTC", PRINCIPAL),
            owner);
      }
      if ("remove".equals(mutation)) {
        service.remove(testId, current.version(), owner);
      }
      if ("input".equals(mutation)) {
        // STUDIO-OBS-012A R7b: the input change goes through the v2 authoring save, because the v1
        // updateTest entry point no longer exists (STUDIO-OBS-015 ruling1).
        var draft = studio.findTestById(testId, owner);
        var authoring = studio.findAuthoringV2ById(testId, owner);
        var step0 = authoring.steps().get(0);
        studio.saveAuthoring(
            testId,
            new AuthoringV2Request(
                2,
                authoring.globalContext(),
                List.of(new AuthoringStep(step0.id(), "Changed step", step0.context()))),
            draft.sourceRevision(),
            draft.configurationRevision(),
            owner);
      }
      assertThat(service.occurrences(testId, 0, 20, owner).data().get(0).code())
          .isEqualTo(
              "update".equals(mutation)
                  ? "SCHEDULE_UPDATED"
                  : "remove".equals(mutation) ? "SCHEDULE_REMOVED" : "LEARN_REQUIRED");
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM studio_schedule_occurrences WHERE test_id=? AND"
                      + " decision='DEFERRED'",
                  Integer.class,
                  testId))
          .isZero();
    }
  }

  @Test
  void callbackLedgerLockDoesNotBlockOverlapAndUncertaintyAfterResumeBlocksNextTick()
      throws Exception {
    var s = enable();
    UUID manual = manualRun(testId, "late-manual");
    due(s);
    var held = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    var callback =
        CompletableFuture.runAsync(
            () ->
                transactions.executeWithoutResult(
                    status -> {
                      jdbc.queryForObject(
                          "SELECT execution_id FROM studio_dispatch_ledger WHERE execution_id=? FOR"
                              + " UPDATE",
                          UUID.class,
                          manual);
                      held.countDown();
                      await(release);
                      statements.closeWithError(manual, "START_TIMEOUT", clock.instant());
                    }));
    assertThat(held.await(5, TimeUnit.SECONDS)).isTrue();
    try {
      assertThat(processor.process(testId)).isEqualTo("OVERLAP");
    } finally {
      release.countDown();
    }
    callback.get(10, TimeUnit.SECONDS);
    assertThat(service.read(testId, owner).state()).isEqualTo("BLOCKED");
    assertThat(service.read(testId, owner).blockedCode()).isEqualTo("UNCERTAIN_EXECUTION");
    clock.set(service.read(testId, owner).nextDueAt());
    assertThat(processor.process(testId)).isEqualTo("UNCERTAIN_EXECUTION");
    assertThat(service.read(testId, owner).unacknowledgedUncertaintyExecutionIds())
        .containsExactly(manual);
  }

  @Test
  void failedCsiRotatesAwayRatherThanStarvingOtherEligibleWork() {
    var failed = enable();
    UUID failedTest = testId;
    String failedCsi = csi;
    fixture();
    var healthy = enable();
    UUID healthyTest = testId;
    clock.set(failed.nextDueAt());
    // A deterministic SQL failure in the earliest CSI leaves its due cursor unchanged.
    jdbc.execute(
        "CREATE FUNCTION fail_scheduling_fixture() RETURNS TRIGGER AS $$ BEGIN IF NEW.csi_id='"
            + failedCsi
            + "' THEN RAISE EXCEPTION 'fixture write failure'; END IF; RETURN NEW; END; $$ LANGUAGE"
            + " plpgsql");
    jdbc.execute(
        "CREATE TRIGGER fail_scheduling_fixture BEFORE INSERT ON studio_schedule_occurrences FOR"
            + " EACH ROW EXECUTE FUNCTION fail_scheduling_fixture()");
    properties.setBatchSize(1);
    properties.setPerCsiBatchSize(1);
    try {
      for (int pass = 0;
          pass < 60 && service.occurrences(healthyTest, 0, 20, owner).data().isEmpty();
          pass++) {
        processor.poll();
      }
      assertThat(service.occurrences(healthyTest, 0, 20, owner).data().get(0).decision())
          .isEqualTo("ACCEPTED");
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM studio_schedule_occurrences WHERE test_id=?",
                  Integer.class,
                  failedTest))
          .isZero();
    } finally {
      jdbc.execute("DROP TRIGGER fail_scheduling_fixture ON studio_schedule_occurrences");
      jdbc.execute("DROP FUNCTION fail_scheduling_fixture()");
    }
  }

  @Test
  void omittedEnabledIsRejectedAndOmittedTimezoneDefaultsToUtc() throws Exception {
    String path = "/api/v1/studio/tests/" + testId + "/schedule";
    var created =
        rest.exchange(
            path,
            HttpMethod.POST,
            new HttpEntity<>(
                "{\"cronExpression\":\"* * * * *\",\"executionPrincipal\":\"studio-local\"}",
                headers()),
            String.class);
    assertThat(created.getStatusCode().value()).isEqualTo(201);
    assertThat(mapper.readTree(created.getBody()).path("timeZone").asText()).isEqualTo("UTC");
    var missing =
        rest.exchange(
            path + "/enabled",
            HttpMethod.PATCH,
            new HttpEntity<>("{\"expectedVersion\":1}", headers()),
            String.class);
    assertThat(missing.getStatusCode().value()).isEqualTo(400);
    assertThat(mapper.readTree(missing.getBody()).path("error").asText())
        .isEqualTo("INVALID_SCHEDULE");
    assertThat(service.read(testId, owner).version()).isEqualTo(1);
  }

  @Test
  void deadlineOverrunAdvancesCursorOnlyPastAttemptedCsi() {
    var slow = enable();
    String slowCsi = csi;
    fixture();
    var fast = enable();
    UUID fastTest = testId;
    clock.set(slow.nextDueAt());
    properties.setPassBudgetMillis(25);
    doAnswer(
            invocation -> {
              if (slowCsi.equals(invocation.getArgument(0))) {
                Thread.sleep(100);
              }
              return null;
            })
        .when(referenceResolver)
        .preflight(
            anyString(),
            anyString(),
            any(UUID.class),
            anyString(),
            any(ReferenceDeclarations.class));
    for (int pass = 0;
        pass < 60 && service.occurrences(fastTest, 0, 20, owner).data().isEmpty();
        pass++) {
      processor.poll();
    }
    assertThat(service.occurrences(fastTest, 0, 20, owner).data().get(0).decision())
        .isEqualTo("ACCEPTED");
  }

  @Test
  void quotaWaitCrossingGraceOrGrantWithdrawalNeverWritesAcceptedWork() throws Exception {
    for (boolean revoke : List.of(false, true)) {
      fixture();
      var s = enable();
      due(s);
      var held = new CountDownLatch(1);
      var release = new CountDownLatch(1);
      var blocker =
          CompletableFuture.runAsync(
              () ->
                  transactions.executeWithoutResult(
                      status -> {
                        jdbc.queryForObject(
                            "SELECT pg_advisory_xact_lock(?,?)", Object.class, 0x5701, 1);
                        held.countDown();
                        await(release);
                      }));
      assertThat(held.await(5, TimeUnit.SECONDS)).isTrue();
      UUID target = testId;
      var decision = CompletableFuture.supplyAsync(() -> processor.process(target));
      try {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline
            && !Boolean.TRUE.equals(
                jdbc.queryForObject(
                    "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=?"
                        + " AND objid=1 AND NOT granted)",
                    Boolean.class,
                    0x5701))) {
          Thread.sleep(10);
        }
        assertThat(
                jdbc.queryForObject(
                    "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=?"
                        + " AND objid=1 AND NOT granted)",
                    Boolean.class,
                    0x5701))
            .isTrue();
        if (revoke) {
          properties.getLocalGrants().remove(csi + "|Production");
        } else {
          clock.set(s.nextDueAt().plusSeconds(properties.getGraceSeconds() + 1));
        }
      } finally {
        release.countDown();
      }
      blocker.get(10, TimeUnit.SECONDS);
      assertThat(decision.get(10, TimeUnit.SECONDS))
          .isEqualTo(revoke ? "BACKGROUND_AUTHORIZATION_DENIED" : "GRACE_EXPIRED");
      assertThat(
              jdbc.queryForObject(
                  "SELECT count(*) FROM studio_dispatch_ledger WHERE test_id=?",
                  Integer.class,
                  testId))
          .isZero();
      assertThat(service.occurrences(testId, 0, 20, owner).data().get(0).executionId()).isNull();
    }
  }

  @Test
  void writeFailuresAtHistoryLedgerAndCursorBoundariesRollbackTheWholeOccurrenceUnit() {
    for (String table :
        List.of("ui_test_executions", "studio_dispatch_ledger", "studio_schedules")) {
      fixture();
      var schedule = enable();
      due(schedule);
      String column = "ui_test_executions".equals(table) ? "ui_test_id" : "test_id";
      String cursorGuard =
          "studio_schedules".equals(table)
              ? " AND EXISTS (SELECT 1 FROM studio_dispatch_ledger WHERE test_id=NEW.test_id)"
              : "";
      jdbc.execute(
          "CREATE FUNCTION scheduling_write_failure() RETURNS TRIGGER AS $$ BEGIN IF NEW."
              + column
              + "='"
              + testId
              + "'::uuid"
              + cursorGuard
              + " THEN RAISE EXCEPTION 'fixture persistence boundary'; END IF; RETURN NEW; END; $$"
              + " LANGUAGE plpgsql");
      jdbc.execute(
          "CREATE TRIGGER scheduling_write_failure BEFORE "
              + ("studio_schedules".equals(table) ? "UPDATE" : "INSERT")
              + " ON "
              + table
              + " FOR EACH ROW EXECUTE FUNCTION scheduling_write_failure()");
      try {
        assertThatThrownBy(() -> processor.process(testId)).isInstanceOf(RuntimeException.class);
        assertThat(
                jdbc.queryForObject(
                    "SELECT count(*) FROM studio_schedule_occurrences WHERE test_id=?",
                    Integer.class,
                    testId))
            .isZero();
        assertThat(
                jdbc.queryForObject(
                    "SELECT count(*) FROM studio_dispatch_ledger WHERE test_id=?",
                    Integer.class,
                    testId))
            .isZero();
        assertThat(
                jdbc.queryForObject(
                    "SELECT count(*) FROM ui_test_executions WHERE ui_test_id=?",
                    Integer.class,
                    testId))
            .isZero();
        assertThat(service.read(testId, owner).nextDueAt()).isEqualTo(schedule.nextDueAt());
      } finally {
        jdbc.execute("DROP TRIGGER scheduling_write_failure ON " + table);
        jdbc.execute("DROP FUNCTION scheduling_write_failure()");
      }
      assertThat(processor.process(testId)).isEqualTo("ACCEPTED");
    }
  }

  @Test
  void editedWriterRaceSerializesWithAcceptanceAndKeepsTheAcceptedRevision() throws Exception {
    var schedule = enable();
    due(schedule);
    var start = new CountDownLatch(1);
    UUID target = testId;
    UUID originalRevision = revisionId;
    Authentication writer = owner;
    var draft = studio.findTestById(target, writer);
    // STUDIO-OBS-012A R1: the edit races through the v2 authoring save, because the v1 updateTest
    // entry point no longer exists (STUDIO-OBS-015 ruling1).
    var authoring = studio.findAuthoringV2ById(target, writer);
    var changed =
        new AuthoringV2Request(
            2,
            authoring.globalContext(),
            List.of(
                new AuthoringStep(
                    authoring.steps().get(0).id(),
                    "A new reviewed input is needed",
                    authoring.steps().get(0).context())));
    var execution =
        CompletableFuture.supplyAsync(
            () -> {
              await(start);
              return processor.process(target);
            });
    var edit =
        CompletableFuture.runAsync(
            () -> {
              await(start);
              studio.saveAuthoring(
                  target, changed, draft.sourceRevision(), draft.configurationRevision(), writer);
            });
    start.countDown();
    String decision = execution.get(10, TimeUnit.SECONDS);
    edit.get(10, TimeUnit.SECONDS);
    assertThat(service.read(target, writer).state()).isEqualTo("BLOCKED");
    assertThat(processor.process(target)).isNull();
    var runs =
        jdbc.queryForList(
            "SELECT revision_id FROM ui_test_executions WHERE ui_test_id=?", UUID.class, target);
    assertThat(runs).allMatch(originalRevision::equals);
    // STUDIO-OBS-009 AC-6 c (R7): a scheduled acceptance can now happen, so the final assertion is
    // conditioned on what the processor decided. An accepted occurrence leaves exactly one run on
    // the revision that was activated; anything else leaves none.
    if ("ACCEPTED".equals(decision)) {
      assertThat(runs).containsExactly(originalRevision);
    } else {
      assertThat(runs).isEmpty();
    }
  }

  /**
   * STUDIO-OBS-009 AC-6 c (R7): the deterministic acceptance-first ordering. The acceptance holds
   * the test row until its transaction commits; the racing edit is started while it holds it and is
   * proven to be waiting (an ungranted lock) before the acceptance commits. The edit therefore
   * serializes strictly after the acceptance, which must have produced exactly one run, on the
   * revision that was activated, and the edit then blocks the schedule.
   */
  @Test
  void editedWriterQueuedBehindAnAcceptanceKeepsExactlyTheAcceptedRevision() throws Exception {
    var schedule = enable();
    due(schedule);
    UUID target = testId;
    UUID originalRevision = revisionId;
    Authentication writer = owner;
    var draft = studio.findTestById(target, writer);
    var authoring = studio.findAuthoringV2ById(target, writer);
    var changed =
        new AuthoringV2Request(
            2,
            authoring.globalContext(),
            List.of(
                new AuthoringStep(
                    authoring.steps().get(0).id(),
                    "A new reviewed input is needed",
                    authoring.steps().get(0).context())));
    var edit = new java.util.concurrent.atomic.AtomicReference<CompletableFuture<Void>>();
    String decision =
        transactions.execute(
            status -> {
              String accepted = processor.process(target);
              edit.set(
                  CompletableFuture.runAsync(
                      () ->
                          studio.saveAuthoring(
                              target,
                              changed,
                              draft.sourceRevision(),
                              draft.configurationRevision(),
                              writer)));
              long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
              Boolean waiting = Boolean.FALSE;
              while (System.nanoTime() < deadline && !Boolean.TRUE.equals(waiting)) {
                waiting =
                    jdbc.queryForObject(
                        "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE NOT granted AND locktype IN"
                            + " ('transactionid','tuple'))",
                        Boolean.class);
                if (!Boolean.TRUE.equals(waiting)) {
                  try {
                    Thread.sleep(10);
                  } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException(ex);
                  }
                }
              }
              assertThat(waiting).as("the edit is waiting on the acceptance's row lock").isTrue();
              assertThat(edit.get()).as("the edit has not completed first").isNotDone();
              return accepted;
            });
    edit.get().get(10, TimeUnit.SECONDS);
    assertThat(decision).isEqualTo("ACCEPTED");
    assertThat(
            jdbc.queryForList(
                "SELECT revision_id FROM ui_test_executions WHERE ui_test_id=?",
                UUID.class,
                target))
        .containsExactly(originalRevision);
    assertThat(service.occurrences(target, 0, 20, writer).data().get(0).decision())
        .isEqualTo("ACCEPTED");
    assertThat(service.read(target, writer).state()).isEqualTo("BLOCKED");
  }

  @Test
  void rawReadinessChangesRefuseExplicitlyAndAnotherActivatorDoesNotRewriteAcceptedProvenance() {
    var schedule = enable();
    due(schedule);
    // Same real edit as the live port above: a counter-only bump is no longer an edit (OBS-015).
    jdbc.update(
        "UPDATE ui_tests SET source_revision=source_revision+1,"
            + " steps=CAST('[\"Go somewhere else\"]' AS jsonb) WHERE id=?",
        testId);
    assertThat(processor.process(testId)).isEqualTo("LEARN_REQUIRED");
    assertThat(service.occurrences(testId, 0, 20, owner).data().get(0).executionId()).isNull();
    fixture();
    schedule = enable();
    due(schedule);
    assertThat(processor.process(testId)).isEqualTo("ACCEPTED");
    var occurrence = service.occurrences(testId, 0, 20, owner).data().get(0);
    var current = service.read(testId, owner);
    var paused =
        service.enabled(
            testId, new StudioScheduleDtos.Enabled(current.version(), false, null, null), owner);
    Authentication another =
        StudioExecutionFixtures.identity("second-activator@citi.com", csi, "owner");
    var resumed =
        service.enabled(
            testId,
            new StudioScheduleDtos.Enabled(paused.version(), true, revisionId, List.of()),
            another);
    assertThat(resumed.activatedBy()).isEqualTo("second-activator@citi.com");
    assertThat(resumed.activationId()).isNotEqualTo(schedule.activationId());
    assertThat(studio.findExecutionById(occurrence.executionId(), owner).activatedBy())
        .isEqualTo(OWNER);
    assertThat(service.occurrences(testId, 0, 20, owner).data().get(0).activatedBy())
        .isEqualTo(OWNER);
  }

  private static void await(CountDownLatch latch) {
    try {
      if (!latch.await(10, TimeUnit.SECONDS)) {
        throw new IllegalStateException("Race timeout");
      }
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(ex);
    }
  }
}
