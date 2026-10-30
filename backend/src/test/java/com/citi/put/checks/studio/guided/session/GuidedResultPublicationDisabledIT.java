package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.guided.evidence.GuidedEvidenceProjection;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationBaseRepository;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationProperties;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationRepository;
import com.citi.put.checks.studio.guided.publication.ObservedReplayPins;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.Cookie;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * C-OBS008-1 / R-08-1e: the real disabled-publication start and HTTP result use one v3 shape. The
 * SUCCEEDED fixture changes only durable state/progress to probe result projection; it does not
 * claim a successful model or browser execution. No provider or runner is contacted.
 */
@SpringBootTest(
    properties = {
      "studio.guided.publication.enabled=false",
      "studio.guided-authoring.reaper-delay-ms=3600000"
    })
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(ObservedPublicationFixture.FreshAuthority.class)
class GuidedResultPublicationDisabledIT {
  private static final String CSI = "60496";
  private static final String OWNER = "publication-disabled-owner@citi.com";
  private static final String ROOT = "/api/v1/studio/guided-sessions";

  @DynamicPropertySource
  static void configuration(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  @Autowired private MockMvc mvc;
  @Autowired private GuidedContracts contracts;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private GuidedSessionRepository repository;
  @Autowired private GuidedSessionService sessions;
  @Autowired private GuidedSessionAccess access;
  @Autowired private GuidedSessionProperties sessionProperties;
  @Autowired private GuidedPublicationProperties publicationProperties;
  @SpyBean private GuidedPublicationBaseRepository bases;
  @Autowired private GuidedPublicationRepository publications;
  @Autowired private ObservedReplayPins pins;
  @Autowired private GuidedPublicPresentationProjector presentation;
  @Autowired private GuidedEvidenceProjection evidence;
  private String id;
  private final List<String> startedSessionIds = new ArrayList<>();
  private Authentication owner;

  @BeforeEach
  void startWithPublicationDisabled() throws Exception {
    assertThat(publicationProperties.enabled()).isFalse();
    var fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI, OWNER);
    owner = StudioExecutionFixtures.identity(OWNER, CSI, "owner");
    startSession();
  }

  private void startSession() throws Exception {
    var fixtures = new StudioExecutionFixtures(jdbc);
    UUID testId =
        fixtures.seedTest(
            "Disabled publication " + UUID.randomUUID(),
            CSI,
            OWNER,
            List.of("Open the home page at https://orders.example.test/home now"));
    ObjectNode start =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("testId", testId.toString())
            .put("sourceRevision", "1")
            .put("configurationRevision", "1")
            .put("environmentId", "Production");
    start.putObject("versions").put("contract", 3);
    JsonNode started =
        contracts.parse(
            mvc.perform(
                    asOwner(post(ROOT))
                        .header("Idempotency-Key", UUID.randomUUID().toString())
                        .contentType("application/json")
                        .content(start.toString()))
                .andExpect(status().isAccepted())
                .andReturn()
                .getResponse()
                .getContentAsString());
    id = started.path("sessionId").asText();
    startedSessionIds.add(id);
    assertThat(id).isNotBlank();
    assertThat(bases.find(id)).as("the disabled start captured no publication base").isEmpty();
  }

  @AfterEach
  void cancelOnlyTheSessionsStartedByThisTest() {
    org.junit.jupiter.api.Assertions.assertAll(
        startedSessionIds.stream()
            .<org.junit.jupiter.api.function.Executable>map(
                ownedId ->
                    () ->
                        sessions.cancel(
                            owner,
                            ownedId,
                            UUID.randomUUID().toString(),
                            contracts
                                .object()
                                .put("schemaVersion", 3)
                                .put("reason", "userRequested"))));
  }

  @Test
  void nonTerminalHttpResultIsAcceptedAndConformsToV3Result() throws Exception {
    for (String state : List.of("PREPARING", "FINALIZING")) {
      state(state);
      assertThat(bases.find(id)).as("nonterminal fallback has no actual base").isEmpty();
      JsonNode result = result(202);
      // The old PublicSession shortcut must fail this assertion before schema validation.
      assertThat(result.path("outcome").asText()).isEqualTo(state);
      contracts.validate("v3/result", result);
      assertThat(result.has("state")).as("no bare PublicSession result body").isFalse();
      assertThat(result.path("publication").path("status").asText()).isEqualTo("PENDING");
      assertThat(result.path("publication").path("receipt").isNull()).isTrue();
      assertNotPublished(result);
      assertOwnProjections(result);
      assertThat(sessions.read(owner, id, "result")).isEqualTo(result);
    }
  }

  @Test
  void terminalSucceededHttpResultRefusesPublicationInsteadOfSavingForever() throws Exception {
    state("SUCCEEDED");
    JsonNode result = result(200);
    contracts.validate("v3/result", result);
    assertThat(result.path("outcome").asText()).isEqualTo("SUCCEEDED");
    assertThat(result.path("publication").path("status").asText()).isEqualTo("REFUSED");
    assertThat(result.path("publication").path("receipt").isNull()).isTrue();
    assertThat(result.path("learnedFromThisRun").asBoolean()).isFalse();
    assertThat(result.path("replayVerified").asBoolean()).isFalse();
    assertThat(result.path("scheduleActivated").asBoolean()).isFalse();
    assertNotPublished(result);
    assertOwnProjections(result);
    assertThat(bases.find(id)).isEmpty();
    assertThat(sessions.read(owner, id, "result")).isEqualTo(result);
  }

  @Test
  void manualEnabledFallbackRetainsTerminalSucceededPendingAndHttp200() throws Exception {
    state("SUCCEEDED");
    // No Spring properties installer is called: this composition keeps the existing enabled
    // default. It uses the real installed presentation and evidence, with the real repository.
    var manual =
        new GuidedSessionService(
            repository,
            contracts,
            access,
            sessionProperties,
            com.citi.put.checks.studio.support.TestDomains.FIXTURES,
            Clock.systemUTC());
    manual.installPresentation(presentation);
    manual.installEvidence(evidence);
    MockMvc fallback = MockMvcBuilders.standaloneSetup(new GuidedSessionController(manual)).build();
    JsonNode result =
        contracts.parse(
            fallback
                .perform(get(ROOT + "/" + id + "/result").principal(owner))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    contracts.validate("v3/result", result);
    assertThat(result.path("outcome").asText()).isEqualTo("SUCCEEDED");
    assertThat(result.path("publication").path("status").asText()).isEqualTo("PENDING");
    assertNotPublished(result);
    assertOwnProjections(result);
  }

  @Test
  void disabledPublicationKeepsResultReadAuthorityChecks() throws Exception {
    mvc.perform(get(ROOT + "/" + id + "/result")).andExpect(status().isUnauthorized());
    mvc.perform(
            get(ROOT + "/" + id + "/result")
                .header("X-User-Id", "another-owner@citi.com")
                .header("X-User-Csi-Ownership", CSI + ":owner"))
        .andExpect(status().isForbidden());
    assertThat(bases.find(id)).isEmpty();
  }

  /** GSM-P5: receipt-path selection alone cannot establish actual publication-base absence. */
  @Test
  void disabledRetainedSucceededBaseKeepsDirectFallbackPendingAndHttp202() throws Exception {
    captureBase();
    state("SUCCEEDED");
    assertThat(bases.find(id)).as("real retained publication base").isPresent();
    assertThat(publications.receipt(id)).isEmpty();
    JsonNode legacy = manualFallback().read(owner, id, "result");
    assertThat(legacy.path("publication").path("status").asText()).isEqualTo("PENDING");
    assertThat(legacy.path("publication").path("receipt").isNull()).isTrue();
    assertNotPublished(legacy);
    JsonNode direct = sessions.read(owner, id, "result");
    assertThat(direct.toString())
        .as("original enabled-default fallback bytes over the same row")
        .isEqualTo(legacy.toString());
    JsonNode http = result(202);
    contracts.validate("v3/result", http);
    assertThat(http.path("outcome").asText()).isEqualTo("SUCCEEDED");
    assertThat(http.path("publication").path("status").asText()).isEqualTo("PENDING");
    assertThat(http.path("publication").path("receipt").isNull()).isTrue();
    assertNotPublished(http);
    assertOwnProjections(http);
  }

  /**
   * Real fixture publication writers supply a valid receipt; no receipt or success is fabricated.
   */
  @Test
  void disabledRetainedReceiptKeepsHttpReceiptAuthorityAndCurrentHeadReadiness() throws Exception {
    var fixtures = new StudioExecutionFixtures(jdbc);
    UUID testId =
        fixtures
            .seedRunnableTest(
                "Retained receipt " + UUID.randomUUID(), CSI, OWNER, List.of("Go home"))
            .testId();
    UUID revision = new ObservedPublicationFixture(jdbc).publish(testId, List.of(), List.of());
    id =
        jdbc.queryForObject(
            "SELECT session_id FROM studio_guided_publications WHERE revision_id=?",
            String.class,
            revision);
    assertThat(bases.find(id)).isPresent();
    var receipt = publications.receipt(id).orElseThrow().document().path("publicReceipt");
    JsonNode legacy = manualFallback().read(owner, id, "result");
    assertThat(sessions.read(owner, id, "result").toString()).isEqualTo(legacy.toString());
    assertThat(legacy.path("publication").path("status").asText()).isEqualTo("PENDING");
    assertThat(legacy.path("publication").path("receipt").isNull()).isTrue();
    assertNotPublished(legacy);

    // A cookie refresh is mandatory on the retained receipt path, even for the same header owner.
    mvc.perform(asOwner(get(ROOT + "/" + id + "/result"))).andExpect(status().isUnauthorized());
    clearInvocations(bases);
    JsonNode http = receiptResult();
    // Preserve the original initial-base and readiness-base reads; no fallback exception lookup.
    verify(bases, times(2)).find(id);
    assertThat(http.path("publication").path("status").asText()).isEqualTo("PUBLISHED");
    assertThat(http.path("publication").path("receipt")).isEqualTo(receipt);
    assertThat(http.path("learnedFromThisRun").asBoolean()).isTrue();
    assertThat(http.path("currentReadiness").path("revisionId").asText())
        .isEqualTo(revision.toString());
    assertThat(http.path("currentReadiness").path("code").asText()).isEqualTo("READY");
    assertThat(http.path("currentReadiness").path("ready").asBoolean()).isTrue();
    assertOwnProjections(http);
    assertDeniedDirectBeforeBaseLookup();
    mvc.perform(get(ROOT + "/" + id + "/result")).andExpect(status().isUnauthorized());
    mvc.perform(
            get(ROOT + "/" + id + "/result")
                .header("X-User-Id", "another-owner@citi.com")
                .header("X-User-Csi-Ownership", CSI + ":owner")
                .cookie(new Cookie("put_session", ObservedPublicationFixture.sessionCookie(owner))))
        .andExpect(status().isForbidden());

    // Historic receipt stays public truth when the current head changes; readiness alone changes.
    assertThat(jdbc.update("UPDATE ui_tests SET confirmed_revision_id=NULL WHERE id=?", testId))
        .isEqualTo(1);
    JsonNode historical = receiptResult();
    assertThat(historical.path("publication")).isEqualTo(http.path("publication"));
    assertThat(historical.path("currentReadiness").path("revisionId").asText())
        .isEqualTo(revision.toString());
    assertThat(historical.path("currentReadiness").path("code").asText()).isEqualTo("HEAD_CHANGED");
    assertThat(historical.path("currentReadiness").path("ready").asBoolean()).isFalse();
  }

  @Test
  void deniedDirectResultsCheckAuthorityBeforeBaseLookupWithAndWithoutBase() throws Exception {
    state("SUCCEEDED");
    assertThat(bases.find(id)).isEmpty();
    assertDeniedDirectBeforeBaseLookup();
    startSession();
    captureBase();
    state("SUCCEEDED");
    assertThat(bases.find(id)).isPresent();
    assertDeniedDirectBeforeBaseLookup();
    mvc.perform(get(ROOT + "/" + id + "/result")).andExpect(status().isUnauthorized());
    mvc.perform(
            get(ROOT + "/" + id + "/result")
                .header("X-User-Id", "another-owner@citi.com")
                .header("X-User-Csi-Ownership", CSI + ":owner"))
        .andExpect(status().isForbidden());
  }

  @Test
  void enabledAndReceiptDefaultPathsDoNotAddBasePresenceLookup() throws Exception {
    state("SUCCEEDED");
    clearInvocations(bases);
    assertThat(
            manualFallback().read(owner, id, "result").path("publication").path("status").asText())
        .isEqualTo("PENDING");
    verify(bases, never()).find(id);
    startSession();
    captureBase();
    state("SUCCEEDED");
    assertThat(bases.find(id)).isPresent();
    clearInvocations(bases);
    assertThat(sessions.read(owner, id, "result").path("publication").path("status").asText())
        .isEqualTo("PENDING");
    verify(bases, times(1)).find(id);
    clearInvocations(bases);
    assertThat(result(202).path("publication").path("status").asText()).isEqualTo("PENDING");
    // The original base projector's initial lookup remains; its receipt-default builder adds none.
    verify(bases, times(1)).find(id);
    startSession();
    state("PREPARING");
    clearInvocations(bases);
    sessions.read(owner, id, "result");
    verify(bases, never()).find(id);
    state("FINALIZING");
    clearInvocations(bases);
    sessions.read(owner, id, "result");
    verify(bases, never()).find(id);
  }

  @Test
  void disabledSucceededBaseQueryFailurePropagatesInsteadOfClaimingAbsentBase() {
    state("SUCCEEDED");
    var failure = new org.springframework.dao.DataAccessResourceFailureException("fixture outage");
    doThrow(failure).when(bases).find(id);
    try {
      assertThatThrownBy(() -> sessions.read(owner, id, "result")).isSameAs(failure);
    } finally {
      reset(bases);
    }
  }

  private void captureBase() {
    repository.transaction(
        () -> {
          var current = repository.lock(id);
          bases.capture(current.document(), pins.requirements(current.document()), Instant.now());
          return null;
        });
  }

  private GuidedSessionService manualFallback() {
    var manual =
        new GuidedSessionService(
            repository,
            contracts,
            access,
            sessionProperties,
            com.citi.put.checks.studio.support.TestDomains.FIXTURES,
            Clock.systemUTC());
    manual.installPresentation(presentation);
    manual.installEvidence(evidence);
    return manual;
  }

  private JsonNode receiptResult() throws Exception {
    JsonNode value =
        contracts.parse(
            mvc.perform(
                    asOwner(get(ROOT + "/" + id + "/result"))
                        .cookie(
                            new Cookie(
                                "put_session", ObservedPublicationFixture.sessionCookie(owner))))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString());
    contracts.validate("v3/result", value);
    return value;
  }

  private void assertDeniedDirectBeforeBaseLookup() {
    var denied = StudioExecutionFixtures.identity("another-owner@citi.com", CSI, "owner");
    clearInvocations(bases);
    for (Authentication caller : java.util.Arrays.asList(denied, null)) {
      assertThatThrownBy(() -> sessions.read(caller, id, "result"))
          .isInstanceOf(GuidedSessionException.class)
          .hasMessage("FORBIDDEN_SCOPE");
    }
    verify(bases, never()).find(id);
  }

  private void state(String state) {
    repository.transaction(
        () -> {
          var current = repository.lock(id);
          current.document().put("state", state);
          current
              .progress()
              .put(
                  "stepIndex",
                  state.equals("PREPARING") ? 0 : current.document().path("sourceSteps").size());
          repository.save(current);
          return null;
        });
  }

  private JsonNode result(int expectedStatus) throws Exception {
    return contracts.parse(
        mvc.perform(asOwner(get(ROOT + "/" + id + "/result")))
            .andExpect(status().is(expectedStatus))
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  private static MockHttpServletRequestBuilder asOwner(MockHttpServletRequestBuilder request) {
    return request.header("X-User-Id", OWNER).header("X-User-Csi-Ownership", CSI + ":owner");
  }

  private static void assertNotPublished(JsonNode result) {
    assertThat(result.path("currentReadiness").path("revisionId").isNull()).isTrue();
    assertThat(result.path("currentReadiness").path("ready").asBoolean()).isFalse();
    assertThat(result.path("currentReadiness").path("code").asText()).isEqualTo("NOT_PUBLISHED");
  }

  private static void assertOwnProjections(JsonNode result) {
    assertThat(result.path("progress").path("stepCount").asInt()).isEqualTo(1);
    assertThat(result.path("explanation").isObject()).isTrue();
    assertThat(result.path("actionTimings").isArray()).isTrue();
    assertThat(result.path("evidence").isObject()).isTrue();
  }
}
