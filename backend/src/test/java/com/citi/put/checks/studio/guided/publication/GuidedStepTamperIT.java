package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.dispatch.DispatchAuthorization;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * ADR-SC-008 FR-3, joined with a real published revision (every SQL guard active; no browser, no
 * runner): one changed byte of a stored step's code is refused by the verifier every authority path
 * runs, before any job exists. Nothing downstream is reached, so no execution, ledger or
 * secret-read row appears.
 */
@Testcontainers(disabledWithoutDocker = true)
class GuidedStepTamperIT {
  private static final GuidedContracts C = new GuidedContracts();

  private static ObservedRevisionVerifier verifier(JdbcTemplate jdbc, JsonNode profile) {
    var catalog = C.object().putArray("catalog").addObject();
    catalog.set("profile", profile);
    catalog.set("build", GuidedPublicationMigrationTest.observedBuild(profile));
    String json = "[" + catalog + "]";
    var properties =
        new ObservedReplayProperties(true, 30000, 1048576, 4194304, 2097152, json, 1280, 720);
    return new ObservedRevisionVerifier(
        jdbc,
        C,
        new GuidedPublicationRepository(jdbc, C),
        new ObservedReplayPins(C, properties),
        properties);
  }

  /** The update runs with user triggers off for this one statement; the verifier is the subject. */
  private static void tamper(JdbcTemplate jdbc, String artifactEdit, UUID revision) {
    jdbc.execute(
        "DO $$ BEGIN SET LOCAL session_replication_role = replica; UPDATE ui_test_revisions SET"
            + " artifact="
            + artifactEdit
            + " WHERE id='"
            + revision
            + "'; END $$");
  }

  private static int count(JdbcTemplate jdbc, String table) {
    return jdbc.queryForObject("SELECT count(*) FROM " + table, Integer.class);
  }

  /**
   * The real authorizer every Run and proof goes through, with a counting authorization behind it:
   * its {@code fresh} call is the step that precedes building the dispatch binding, so a count of
   * zero means no dispatch was ever reachable.
   */
  private static ObservedReplayAuthorizer authorizer(
      JdbcTemplate jdbc, JsonNode profile, AtomicInteger dispatchCalls) {
    var catalog = C.object().putArray("catalog").addObject();
    catalog.set("profile", profile);
    catalog.set("build", GuidedPublicationMigrationTest.observedBuild(profile));
    var properties =
        new ObservedReplayProperties(
            true, 30000, 1048576, 4194304, 2097152, "[" + catalog + "]", 1280, 720);
    var counting =
        new DispatchAuthorization() {
          @Override
          public String recheck(UUID executionId, UUID testId, String csiId, String principal) {
            return "policy";
          }

          @Override
          public BffAuthenticationToken fresh(
              org.springframework.security.core.Authentication caller,
              jakarta.servlet.http.HttpServletRequest request,
              String expectedPrincipal,
              String csiId,
              boolean execution) {
            dispatchCalls.incrementAndGet();
            return (BffAuthenticationToken) caller;
          }
        };
    var pins = new ObservedReplayPins(C, properties);
    return new ObservedReplayAuthorizer(
        jdbc,
        C,
        new ObservedRevisionVerifier(
            jdbc, C, new GuidedPublicationRepository(jdbc, C), pins, properties),
        pins,
        counting,
        properties,
        Clock.systemUTC());
  }

  private static BffAuthenticationToken caller() {
    return new BffAuthenticationToken(
        new UserIdentity("core-user", "owner@example.test", "Owner", "Ops", List.of(), List.of()));
  }

  @Test
  void aTamperedStepIsRefusedByTheAuthorizerWithZeroDispatchCalls() throws Exception {
    try (var fixture = GuidedSecretLoginMigrationTest.publishedRetry()) {
      var jdbc = fixture.jdbc();
      UUID revision = UUID.fromString(fixture.original().path("revisionId").asText());
      UUID testId = fixture.testId();
      // The recorded revision is what "Verify again" proves; authorize it by its id.
      jdbc.update("UPDATE ui_tests SET candidate_revision_id=? WHERE id=?", revision, testId);
      var dispatchCalls = new AtomicInteger();
      var authorizer =
          authorizer(jdbc, GuidedPublicationMigrationTest.currentProfile(), dispatchCalls);
      var request = new MockHttpServletRequest();

      // Control: the untampered revision passes the verifier and reaches the dispatch step.
      authorizer.authorize(testId, revision, caller(), request);
      assertThat(dispatchCalls).hasValue(1);

      String code =
          jdbc.queryForObject(
              "SELECT artifact#>>'{steps,0,operations,0,operation,code}' FROM ui_test_revisions"
                  + " WHERE id=?",
              String.class,
              revision);
      tamper(
          jdbc,
          "jsonb_set(artifact,'{steps,0,operations,0,operation,code}','"
              + C.object().put("c", code.substring(0, code.length() - 1) + "X").path("c")
              + "'::jsonb)",
          revision);

      assertThatThrownBy(() -> authorizer.authorize(testId, revision, caller(), request))
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              failure -> assertThat(failure.getMessage()).isEqualTo("EVIDENCE_MISMATCH"));
      assertThat(dispatchCalls).hasValue(1);
    }
  }

  @Test
  void oneChangedByteOfStoredCodeIsRefusedBeforeAnyJobAndLeavesNoEffect() throws Exception {
    try (var fixture = GuidedSecretLoginMigrationTest.publishedRetry()) {
      var jdbc = fixture.jdbc();
      UUID revision = UUID.fromString(fixture.original().path("revisionId").asText());
      var verifier = verifier(jdbc, GuidedPublicationMigrationTest.currentProfile());
      assertThat(verifier.verify(revision).path("artifact").path("steps")).isNotEmpty();
      int ledger = count(jdbc, "studio_dispatch_ledger"),
          executions = count(jdbc, "ui_test_executions"),
          reads = count(jdbc, "studio_observed_secret_read_entries"),
          audit = count(jdbc, "studio_secret_use_audit");

      String code =
          jdbc.queryForObject(
              "SELECT artifact#>>'{steps,0,operations,0,operation,code}' FROM ui_test_revisions"
                  + " WHERE id=?",
              String.class,
              revision);
      String changed = code.substring(0, code.length() - 1) + "X";
      assertThat(changed).isNotEqualTo(code);
      tamper(
          jdbc,
          "jsonb_set(artifact,'{steps,0,operations,0,operation,code}','"
              + C.object().put("c", changed).path("c")
              + "'::jsonb)",
          revision);

      assertThatThrownBy(() -> verifier.verify(revision))
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              failure -> {
                assertThat(failure.getMessage()).isEqualTo("EVIDENCE_MISMATCH");
                assertThat(failure.status()).isEqualTo(409);
              });
      assertThat(count(jdbc, "studio_dispatch_ledger")).isEqualTo(ledger);
      assertThat(count(jdbc, "ui_test_executions")).isEqualTo(executions);
      assertThat(count(jdbc, "studio_observed_secret_read_entries")).isEqualTo(reads);
      assertThat(count(jdbc, "studio_secret_use_audit")).isEqualTo(audit);
    }
  }

  @Test
  void aRevisionLearnedUnderAProfileThisDeploymentDoesNotTrustIsRefusedByThePin() throws Exception {
    // An old typed revision carries the profile of the contract it was learned under; the trusted
    // catalog no longer lists it, so the pin refuses it with a closed code before any schema check.
    try (var fixture = GuidedSecretLoginMigrationTest.publishedRetry()) {
      var jdbc = fixture.jdbc();
      UUID revision = UUID.fromString(fixture.original().path("revisionId").asText());
      var properties =
          new ObservedReplayProperties(true, 30000, 1048576, 4194304, 2097152, "[]", 1280, 720);
      var verifier =
          new ObservedRevisionVerifier(
              jdbc,
              C,
              new GuidedPublicationRepository(jdbc, C),
              new ObservedReplayPins(C, properties),
              properties);
      assertThatThrownBy(() -> verifier.verify(revision))
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              failure -> {
                assertThat(failure.getMessage()).isEqualTo("RUNTIME_INCOMPATIBLE");
                assertThat(failure.status()).isEqualTo(409);
              });
    }
  }
}
