package com.citi.put.checks.studio.authoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.dto.AuthoringEvidenceReference;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.AuthoringV2Response;
import com.citi.put.checks.studio.dto.ContextText;
import com.citi.put.checks.studio.dto.GlobalAuthoringContext;
import com.citi.put.checks.studio.dto.StepAuthoringContext;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.dto.VariableReference;
import com.citi.put.checks.studio.readiness.StudioReadiness;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;

/** Atomic authoring revision classification and canonical snapshot tests. */
@SpringBootTest
@ActiveProfiles("test")
class StudioAuthoringRevisionTest {

  private static final String OWNER = "revision-owner@citi.com";
  private static final String CSI = "61837";
  private static final String FIRST_STEP = "Navigate to \"https://example.test/one\"";
  private static final String SECOND_STEP = "Navigate to \"https://example.test/two\"";

  @Autowired StudioService studioService;
  @Autowired JdbcTemplate jdbc;

  private UUID testId;
  private Authentication owner;
  private AuthoringV2Response promoted;

  @BeforeEach
  void setUp() {
    seed();
    testId = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_tests (id,name,csi_id,environment,browser,steps,variables,created_by,"
            + "created_at,updated_at) VALUES (?,'Revision',?,'Production','chromium',"
            + "CAST(? AS jsonb),'[]'::jsonb,?,?,?)",
        testId,
        CSI,
        new com.fasterxml.jackson.databind.ObjectMapper()
            .valueToTree(List.of(FIRST_STEP, SECOND_STEP))
            .toString(),
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    owner = identity();
    com.citi.put.checks.studio.support.CanonicalAuthoringFixture.seed(jdbc, testId);
    jdbc.update("UPDATE ui_tests SET configuration_revision=2 WHERE id=?", testId);
    promoted = studioService.findAuthoringV2ById(testId, owner);
  }

  @Test
  void duplicateAndOrphanIdsAreRejectedWithoutPartialWrites() {
    AuthoringStep first = promoted.steps().get(0);
    AuthoringV2Request duplicate =
        new AuthoringV2Request(2, GlobalAuthoringContext.empty(), List.of(first, first));
    assertThatThrownBy(() -> studioService.saveAuthoring(testId, duplicate, 1, 2, owner))
        .isInstanceOf(StudioValidationException.class)
        .hasMessageContaining("more than once");

    AuthoringEvidenceReference orphan =
        new AuthoringEvidenceReference(
            UUID.randomUUID(),
            1,
            AuthoringEvidenceReference.Source.SUPPLIED,
            CSI,
            "Production",
            "/login",
            "visible",
            UUID.randomUUID(),
            OffsetDateTime.parse("2026-09-18T12:00:00Z"),
            AuthoringEvidenceReference.Completeness.COMPLETE,
            "a".repeat(64));
    AuthoringV2Request orphaned =
        new AuthoringV2Request(
            2, new GlobalAuthoringContext(List.of(), List.of(orphan)), promoted.steps());
    assertThatThrownBy(() -> studioService.saveAuthoring(testId, orphaned, 1, 2, owner))
        .isInstanceOf(StudioValidationException.class)
        .hasMessageContaining("outside its context scope");
    assertThat(revisions()).containsExactly(1L, 2L);
  }

  @Test
  void twoWritesFromOneRevisionHaveOneWinnerAndOneStaleRevision() throws Exception {
    AuthoringV2Request left = withFirstText("left");
    AuthoringV2Request right = withFirstText("right");
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      List<Callable<Object>> writes = List.of(() -> saveOrCode(left), () -> saveOrCode(right));
      List<Future<Object>> results = pool.invokeAll(writes);
      assertThat(results.get(0).get()).isIn("SUCCESS", "STALE_REVISION");
      assertThat(results.get(1).get()).isIn("SUCCESS", "STALE_REVISION");
      assertThat(List.of(results.get(0).get(), results.get(1).get()))
          .containsExactlyInAnyOrder("SUCCESS", "STALE_REVISION");
      assertThat(revisions()).containsExactly(2L, 2L);
    } finally {
      pool.shutdownNow();
    }
  }

  @Test
  void v1ShapeIsRefusedAndOneCanonicalSnapshotRemains() {
    var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
    var validator = jakarta.validation.Validation.buildDefaultValidatorFactory().getValidator();
    assertThatThrownBy(
            () ->
                com.citi.put.checks.studio.dto.StudioAuthoringValidation.read(
                    mapper,
                    validator,
                    mapper.createObjectNode().putArray("steps").add("different")))
        .isInstanceOf(
            com.citi.put.checks.studio.dto.StudioAuthoringValidation.InvalidAuthoringException
                .class);

    UITestDto metadata =
        com.citi.put.checks.studio.support.CanonicalAuthoringFixture.update(
            studioService,
            jdbc,
            testId,
            ordinaryRequest("Renamed", List.of(FIRST_STEP, SECOND_STEP), List.of(), 1, 2));
    assertThat(metadata.sourceRevision()).isEqualTo(1);
    assertThat(metadata.configurationRevision()).isEqualTo(2);

    try {
      com.fasterxml.jackson.databind.JsonNode frozen =
          new com.fasterxml.jackson.databind.ObjectMapper()
              .readTree(
                  jdbc.queryForObject(
                      "SELECT authoring::text FROM ui_tests WHERE id=?", String.class, testId));
      assertThat(frozen.path("steps").get(0).path("id").asText())
          .isEqualTo(promoted.steps().get(0).id().toString());
      assertThat(frozen.path("steps").get(0).path("text").asText()).isEqualTo(FIRST_STEP);
      assertThat(frozen.path("steps").get(1).path("text").asText()).isEqualTo(SECOND_STEP);
      assertThat(
              new com.fasterxml.jackson.databind.ObjectMapper()
                  .readTree(
                      jdbc.queryForObject(
                          "SELECT steps::text FROM ui_tests WHERE id=?", String.class, testId)))
          .isEqualTo(
              new com.fasterxml.jackson.databind.ObjectMapper()
                  .valueToTree(List.of(FIRST_STEP, SECOND_STEP)));
    } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
      throw new AssertionError(exception);
    }
  }

  @Test
  void referencedNonsecretValueChangeRefreshesIdentityAndInvalidatesCandidate() {
    jdbc.update(
        "UPDATE ui_tests SET variables='[{\"name\":\"USER\",\"kind\":\"plain\","
            + "\"value\":\"alpha\"}]'::jsonb WHERE id=?",
        testId);
    AuthoringStep referenced =
        new AuthoringStep(
            promoted.steps().get(0).id(),
            FIRST_STEP,
            new StepAuthoringContext(List.of(new VariableReference("USER")), List.of()));
    AuthoringV2Response saved =
        studioService.saveAuthoring(
            testId,
            new AuthoringV2Request(
                2, GlobalAuthoringContext.empty(), List.of(referenced, promoted.steps().get(1))),
            1,
            2,
            owner);
    String before = saved.revisionInputs().nonsecretReferencedValues().get(0).valueHash();

    UITestDto changed =
        com.citi.put.checks.studio.support.CanonicalAuthoringFixture.update(
            studioService,
            jdbc,
            testId,
            ordinaryRequest(
                "Revision",
                List.of(FIRST_STEP, SECOND_STEP),
                List.of(StudioVariable.plain("USER", "beta")),
                1,
                3));
    String after =
        studioService
            .findAuthoringV2ById(testId, owner)
            .revisionInputs()
            .nonsecretReferencedValues()
            .get(0)
            .valueHash();
    assertThat(after).isNotEqualTo(before);
    assertThat(changed.configurationRevision()).isEqualTo(4);
    assertThat(changed.readiness()).isEqualTo(StudioReadiness.UNLEARNED);
  }

  @Test
  void selectedEvidenceChangeInvalidatesWhileMetadataOnlyUpdateRetainsReadiness() {
    AuthoringEvidenceReference firstEvidence = evidence(UUID.randomUUID(), "a".repeat(64));
    AuthoringV2Response selected =
        studioService.saveAuthoring(
            testId,
            new AuthoringV2Request(
                2, new GlobalAuthoringContext(List.of(), List.of(firstEvidence)), promoted.steps()),
            1,
            2,
            owner);
    UITestDto metadata =
        com.citi.put.checks.studio.support.CanonicalAuthoringFixture.update(
            studioService,
            jdbc,
            testId,
            ordinaryRequest("Metadata only", List.of(FIRST_STEP, SECOND_STEP), List.of(), 1, 3));
    assertThat(metadata.configurationRevision()).isEqualTo(3);

    AuthoringEvidenceReference replacement = evidence(UUID.randomUUID(), "b".repeat(64));
    AuthoringV2Response changed =
        studioService.saveAuthoring(
            testId,
            new AuthoringV2Request(
                2, new GlobalAuthoringContext(List.of(), List.of(replacement)), promoted.steps()),
            1,
            3,
            owner);
    assertThat(changed.revisionInputs().selectedEvidenceReferences())
        .extracting(input -> input.id())
        .containsExactly(replacement.id());
    assertThat(selected.revisionInputs().selectedEvidenceReferences())
        .extracting(input -> input.id())
        .containsExactly(firstEvidence.id());
    assertThat(revisions()).containsExactly(1L, 4L);
  }

  private Object saveOrCode(AuthoringV2Request request) {
    try {
      studioService.saveAuthoring(testId, request, 1, 2, owner);
      return "SUCCESS";
    } catch (StudioConflictException conflict) {
      return conflict.getCode();
    }
  }

  private AuthoringV2Request withFirstText(String text) {
    return new AuthoringV2Request(
        2,
        GlobalAuthoringContext.empty(),
        List.of(
            new AuthoringStep(promoted.steps().get(0).id(), text, StepAuthoringContext.empty()),
            promoted.steps().get(1)));
  }

  private AuthoringV2Request withGlobal(String value) {
    return new AuthoringV2Request(
        2,
        new GlobalAuthoringContext(List.of(new ContextText(value)), List.of()),
        promoted.steps());
  }

  private UITestRequest ordinaryRequest(
      String name,
      List<String> steps,
      List<StudioVariable> variables,
      long sourceRevision,
      long configurationRevision) {
    return new UITestRequest(
        name,
        "metadata",
        CSI,
        "Production",
        steps,
        variables,
        TestConfiguration.defaults(),
        sourceRevision,
        configurationRevision);
  }

  private AuthoringEvidenceReference evidence(UUID id, String hash) {
    return new AuthoringEvidenceReference(
        id,
        1,
        AuthoringEvidenceReference.Source.SUPPLIED,
        CSI,
        "Production",
        "/login",
        "visible",
        promoted.steps().get(0).id(),
        OffsetDateTime.parse("2026-09-18T12:00:00Z"),
        AuthoringEvidenceReference.Completeness.COMPLETE,
        hash);
  }

  private List<Long> revisions() {
    return jdbc.queryForObject(
        "SELECT source_revision, configuration_revision FROM ui_tests WHERE id=?",
        (result, row) -> List.of(result.getLong(1), result.getLong(2)),
        testId);
  }

  private void seed() {
    jdbc.update(
        "INSERT INTO users (id,sso_id,name,email,created_at,is_active) VALUES"
            + " (?,?,'Owner',?,?,true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + OWNER,
        OWNER,
        Timestamp.from(Instant.now()));
    jdbc.update(
        "INSERT INTO csi_systems (id,name,business_unit,criticality,owner_email,environment,"
            + "status,created_at,updated_at) VALUES (?,'Revision CSI','Ops','HIGH',?,"
            + "'Production','OPERATIONAL',?,?) ON CONFLICT (id) DO NOTHING",
        CSI,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  private static Authentication identity() {
    return new BffAuthenticationToken(
        new UserIdentity(
            "uid-revision",
            OWNER,
            "Owner",
            "Ops",
            List.of(),
            List.of(new CsiOwnershipEntry(CSI, "owner"))));
  }
}
