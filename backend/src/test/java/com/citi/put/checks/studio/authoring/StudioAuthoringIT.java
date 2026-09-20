package com.citi.put.checks.studio.authoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.dto.UITestRequest;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** Real PostgreSQL checks for atomic source/identity/scope writes and legacy invalidation. */
@SpringBootTest(properties = "studio.authoring.v2-enabled=true")
@ActiveProfiles("local")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class StudioAuthoringIT {
  @Autowired StudioAuthoringService service;
  @Autowired StudioService legacy;
  @Autowired JdbcTemplate jdbc;
  @Autowired com.citi.put.checks.studio.compile.CompileStateService states;
  @Autowired com.citi.put.checks.studio.compile.AuthoringLimits limits;
  @Autowired com.citi.put.checks.studio.compile.CredentialPatternScreen screen;

  private final BffAuthenticationToken auth =
      new BffAuthenticationToken(
          new UserIdentity(
              "authoring-test",
              "authoring@citi.com",
              "Authoring",
              "Ops",
              List.of("checks-admin"),
              List.of()));

  @BeforeAll
  void initialize() throws Exception {
    jdbc.update(
        """
        INSERT INTO users(id,sso_id,name,email,is_active)
        VALUES (gen_random_uuid(),'authoring-test','Authoring','authoring@citi.com',true)
        ON CONFLICT(email) DO NOTHING
        """);
    jdbc.update(
        """
        INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment,status)
        VALUES ('724','Authoring','Ops','HIGH','authoring@citi.com','Production','OPERATIONAL')
        ON CONFLICT(id) DO NOTHING
        """);
    String cutover =
        Files.readString(Path.of("db/cutover/V19__studio_inference_candidate_identity.sql"));
    jdbc.execute(
        (ConnectionCallback<Void>)
            connection -> {
              try (var statement = connection.createStatement()) {
                statement.execute("SET checks.inference_publishers_drained = 'true'");
                statement.execute(cutover);
              }
              return null;
            });
  }

  @Test
  void createAndScopeEditPersistCoherentSnapshotWithExactNoop() {
    AuthoringDtos.View created = service.create(write(null, "Open home", "UNKNOWN", 1), auth);
    UUID test = created.test().id();
    UUID step = UUID.fromString(created.authoring().path("steps").get(0).path("id").asText());
    assertThat(created.test().sourceRevision()).isEqualTo(1L);
    assertThat(
            jdbc.queryForObject(
                "SELECT compile_request_id FROM ui_tests WHERE id = ?", UUID.class, test))
        .isNull();
    assertThat(created.authoring().path("steps").get(0).path("text").asText())
        .isEqualTo("Open home");
    AuthoringDtos.View scoped =
        service.update(test, write(step, "Open home", "STEP_SCOPED", 1), auth);
    assertThat(scoped.test().sourceRevision()).isEqualTo(2L);
    assertThat(scoped.authoringHash()).isNotEqualTo(created.authoringHash());
    assertThat(scoped.scopeReviewedBy()).isEqualTo("authoring@citi.com");
    AuthoringDtos.View noop =
        service.update(test, write(step, "Open home", "STEP_SCOPED", 2), auth);
    assertThat(noop.test().sourceRevision()).isEqualTo(2L);
    assertThat(noop.scopeReviewedAt()).isEqualTo(scoped.scopeReviewedAt());
    assertThatThrownBy(
            () -> service.update(test, write(step, "Click home", "STEP_SCOPED", 1), auth))
        .isInstanceOf(StudioConflictException.class);
    assertThat(service.get(test, auth).authoringHash()).isEqualTo(scoped.authoringHash());
  }

  @Test
  void foreignIdentityRollsBackSourceAndRegistry() {
    AuthoringDtos.View first = service.create(write(null, "Open home", "UNKNOWN", 1), auth);
    AuthoringDtos.View other = service.create(write(null, "Click save", "UNKNOWN", 1), auth);
    UUID foreign = UUID.fromString(other.authoring().path("steps").get(0).path("id").asText());
    assertThatThrownBy(
            () ->
                service.update(
                    first.test().id(), write(foreign, "Changed", "STEP_SCOPED", 1), auth))
        .isInstanceOf(StudioValidationException.class);
    AuthoringDtos.View actual = service.get(first.test().id(), auth);
    assertThat(actual.test().sourceRevision()).isEqualTo(1);
    assertThat(actual.authoringHash()).isEqualTo(first.authoringHash());
    assertThat(actual.test().steps()).containsExactly("Open home");
  }

  @Test
  void englishAndScopeChangeAdvanceOnceAndLegacySemanticEditClearsMapping() {
    AuthoringDtos.View first = service.create(write(null, "Open home", "UNKNOWN", 1), auth);
    UUID step = UUID.fromString(first.authoring().path("steps").get(0).path("id").asText());
    AuthoringDtos.View edited =
        service.update(first.test().id(), write(step, "Click save", "STEP_SCOPED", 1), auth);
    assertThat(edited.test().sourceRevision()).isEqualTo(2);
    legacy.updateTest(
        first.test().id(),
        new UITestRequest(
            "Draft",
            null,
            "724",
            "Test",
            List.of("Click cancel"),
            List.of(),
            TestConfiguration.defaults(),
            2L,
            1L));
    AuthoringDtos.View oldWriter = service.get(first.test().id(), auth);
    assertThat(oldWriter.test().sourceRevision()).isEqualTo(3);
    assertThat(oldWriter.authoring()).isNull();
    assertThat(oldWriter.authoringHash()).isNull();
    assertThat(oldWriter.scopeReviewedBy()).isNull();
    assertThat(oldWriter.test().steps()).containsExactly("Click cancel");
  }

  @Test
  void expiredCrashedAttemptAndSweptRequestAreFailedWithoutInventedCounts() throws Exception {
    var created = service.create(write(null, "Open home", "UNKNOWN", 1), auth);
    var capture =
        states.capture(
            created.test().id(),
            "authoring@citi.com",
            limits,
            screen,
            "a".repeat(64),
            java.time.Duration.ofMillis(100),
            "FULL",
            false,
            null,
            null,
            null);
    Thread.sleep(150);
    var expired = service.attempt(created.test().id(), capture.request().requestId(), auth);
    assertThat(expired.path("state").asText()).isEqualTo("FAILED");
    assertThat(expired.path("errorCode").asText()).isEqualTo("COMPILE_BUDGET_EXCEEDED");
    assertThat(expired.path("usage").path("proposalCount").isNull()).isTrue();
    assertThat(expired.path("usage").path("elapsedMs").isNull()).isTrue();
    states.sweepAbandoned(java.time.Duration.ofMillis(1), 100);
    assertThat(
            service
                .attempt(created.test().id(), capture.request().requestId(), auth)
                .path("state")
                .asText())
        .isEqualTo("FAILED");
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM ui_test_compile_outcomes WHERE request_id=?",
                Integer.class,
                capture.request().requestId()))
        .isZero();
  }

  @Test
  void candidateCommittedBeforeWorkerCrashWinsOverLaterDeadlineWithoutInventedTelemetry()
      throws Exception {
    var created = service.create(write(null, "Open home", "UNKNOWN", 1), auth);
    var capture =
        states.capture(
            created.test().id(),
            "authoring@citi.com",
            limits,
            screen,
            "a".repeat(64),
            java.time.Duration.ofMillis(600),
            "FULL",
            false,
            null,
            null,
            null);
    String source =
        com.citi.put.checks.studio.compile.ArtifactCanonicalizer.canonicalSource(
            List.of("Open home"));
    String artifact =
        "{\"version\":1,\"steps\":[{\"stepIndex\":0,\"originalText\":\"Open home\","
            + "\"code\":\"await page.goto('https://example.com');\"}]}";
    var candidate =
        new com.citi.put.checks.studio.compile.CandidateRevision(
            1,
            source,
            com.citi.put.checks.studio.compile.ArtifactCanonicalizer.hash(source),
            artifact,
            com.citi.put.checks.studio.compile.ArtifactCanonicalizer.hash(artifact),
            1,
            capture.inputs().configurationJson(),
            capture.inputs().referencesJson(),
            "{}",
            "authoring@citi.com");
    states.publishCandidate(created.test().id(), capture.request(), candidate);
    Thread.sleep(650);
    var recovered = service.attempt(created.test().id(), capture.request().requestId(), auth);
    assertThat(recovered.path("state").asText()).isEqualTo("CANDIDATE");
    assertThat(recovered.path("revisionId").isTextual()).isTrue();
    assertThat(recovered.path("artifactHash").asText()).isEqualTo(candidate.artifactHash());
    assertThat(recovered.path("usage").path("proposalCount").isNull()).isTrue();
  }

  private AuthoringDtos.Write write(UUID id, String text, String scope, long revision) {
    return new AuthoringDtos.Write(
        "Draft",
        null,
        "724",
        "Test",
        List.of(new AuthoringDtos.Step(id, text)),
        new AuthoringDtos.Scope("1.0.0", scope),
        List.of(),
        TestConfiguration.defaults(),
        revision,
        1L);
  }
}
