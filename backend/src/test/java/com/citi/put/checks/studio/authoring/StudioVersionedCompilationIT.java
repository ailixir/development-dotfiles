package com.citi.put.checks.studio.authoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.compile.CompileBudget;
import com.citi.put.checks.studio.compile.gateway.CompileRequest;
import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayProvenance;
import com.citi.put.checks.studio.compile.gateway.LlmGatewayClient;
import com.citi.put.checks.studio.compile.validator.RunnerValidationClient;
import com.citi.put.checks.studio.compile.validator.ValidationOutcome;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.readiness.RuntimePinProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * T1 only: real PostgreSQL authoring/capture/publication/confirmation/acceptance with scripted
 * inference and validator. The baseline PASSED row is explicitly synthetic test data, never
 * evidence of browser execution or live-model quality.
 */
@SpringBootTest(
    properties = {
      "studio.authoring.v2-enabled=true",
      "studio.compile.incremental.enabled=true",
      "studio.execution.dispatcher.enabled=false",
      "studio.versioned-compilation-test=true"
    })
@ActiveProfiles("local")
class StudioVersionedCompilationIT {
  @Autowired StudioAuthoringService authoring;
  @Autowired StudioService studio;
  @Autowired JdbcTemplate jdbc;
  @Autowired ObjectMapper mapper;
  @Autowired RuntimePinProperties pin;
  @MockBean LlmGatewayClient gateway;
  @MockBean RunnerValidationClient validator;
  private final List<CompileRequest> proposals = new CopyOnWriteArrayList<>();
  private final List<JsonNode> validated = new CopyOnWriteArrayList<>();
  private final List<List<String>> validatedSource = new CopyOnWriteArrayList<>();
  private final BffAuthenticationToken auth =
      new BffAuthenticationToken(
          new UserIdentity(
              "versioned-t1",
              "versioned-t1@citi.com",
              "Synthetic integration",
              "Ops",
              List.of("checks-admin"),
              List.of()));

  @Test
  void fullThenIncrementalUsesOneCoherentVersionedFlowAndFullAcceptance() throws Exception {
    seedAndCutover();
    when(gateway.compilationSettings()).thenReturn("{\"model\":\"synthetic-t1\"}");
    when(gateway.propose(any(CompileRequest.class), any(CompileBudget.class)))
        .thenAnswer(
            call -> {
              CompileRequest request = call.getArgument(0);
              proposals.add(request);
              var proposal =
                  mapper.createObjectNode().put("version", 1).put("kind", request.proposalKind());
              var steps = proposal.putArray("steps");
              for (int i = 0; i < request.writableStepIds().size(); i++) {
                String code =
                    "PATCH".equals(request.proposalKind())
                        ? "await expect(page.getByText('Updated')).toBeVisible();"
                        : i == 0
                            ? "await page.goto('https://example.com');"
                            : "await expect(page.getByText('Home')).toBeVisible();";
                steps
                    .addObject()
                    .put("stepId", request.writableStepIds().get(i).toString())
                    .put("status", "GENERATED")
                    .put("code", code);
              }
              return CompileResponse.ok(
                  proposal.toString(),
                  new GatewayProvenance(
                      "synthetic-t1", "1", request.promptVersion(), "test", true, 0),
                  0,
                  1,
                  1,
                  1);
            });
    when(validator.validate(
            anyString(), anyList(), anyCollection(), anyCollection(), any(CompileBudget.class)))
        .thenAnswer(
            call -> {
              JsonNode artifact = mapper.readTree((String) call.getArgument(0));
              List<String> source = call.getArgument(1);
              validated.add(artifact);
              validatedSource.add(List.copyOf(source));
              return ValidationOutcome.verdict(
                  true,
                  pin.validatorSchemaVersion(),
                  List.of(),
                  java.util.stream.IntStream.range(0, source.size())
                      .mapToObj(i -> new ValidationOutcome.StepVerdict(i, true, List.of()))
                      .toList());
            });

    AuthoringDtos.View created = authoring.create(write(null, null, "Check Home", 1), auth);
    UUID testId = created.test().id();
    UUID firstId = UUID.fromString(created.authoring().path("steps").get(0).path("id").asText());
    UUID lastId = UUID.fromString(created.authoring().path("steps").get(1).path("id").asText());
    assertThat(proposals).isEmpty();
    assertThat(executionCount(testId)).isZero();

    AuthoringDtos.Accepted full = authoring.compile(testId, request(created, "FULL"), auth);
    AuthoringDtos.View first = awaitCandidate(testId, full.compileRequestId());
    assertThat(full.plan().path("selectedMode").asText()).isEqualTo("FULL");
    assertThat(executionCount(testId)).isZero();
    authoring.confirm(testId, confirmation(first), auth);
    assertThat(executionCount(testId)).isZero();
    var baselineRun = studio.executeTest(testId, auth, UUID.randomUUID().toString());
    assertThat(baselineRun.revisionId())
        .isEqualTo(UUID.fromString(first.compileAttempt().path("revisionId").asText()));
    assertFullScope(baselineRun.executionId());

    // Explicitly synthetic T1 fixture. Runtime/config identity comes from the accepted revision;
    // this is a planner plumbing test and makes no claim that a browser actually ran.
    jdbc.update(
        """
        UPDATE ui_test_executions SET status = 'PASSED', ended_at = NOW(),
          runtime_versions = (SELECT jsonb_build_object(
            'validator',r.provenance->>'validatorSchemaVersion',
            'executor',r.provenance->>'executorVersion',
            'playwright',r.provenance->>'playwrightVersion')
            FROM ui_test_revisions r WHERE r.id = revision_id)
        WHERE id = ?
        """,
        baselineRun.executionId());
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET state = 'DONE' WHERE execution_id = ?",
        baselineRun.executionId());

    AuthoringDtos.View edited =
        authoring.update(
            testId, write(firstId, lastId, "Check Updated", first.test().sourceRevision()), auth);
    assertThat(proposals).hasSize(1);
    assertThat(executionCount(testId)).isEqualTo(1);
    AuthoringDtos.Accepted incremental = authoring.compile(testId, request(edited, "AUTO"), auth);
    assertThat(incremental.plan().path("selectedMode").asText()).isEqualTo("INCREMENTAL");
    assertThat(incremental.plan().path("writableStepIds").toString())
        .isEqualTo("[\"" + lastId + "\"]");
    assertThat(incremental.plan().path("baselineExecutionId").asText())
        .isEqualTo(baselineRun.executionId().toString());
    AuthoringDtos.View second = awaitCandidate(testId, incremental.compileRequestId());
    assertThat(second.compileAttempt().path("revisionId"))
        .isNotEqualTo(first.compileAttempt().path("revisionId"));
    assertThat(proposals).hasSize(2);
    assertThat(proposals.get(1).writableStepIds()).containsExactly(lastId);
    assertThat(validated).hasSize(2);
    assertThat(validatedSource.get(1)).containsExactly("Open example", "Check Updated");
    assertThat(validated.get(1).path("steps")).hasSize(2);
    assertThat(validated.get(1).path("steps").get(0))
        .isEqualTo(validated.get(0).path("steps").get(0));
    assertThat(executionCount(testId)).isEqualTo(1);
    authoring.confirm(testId, confirmation(second), auth);
    var nextRun = studio.executeTest(testId, auth, UUID.randomUUID().toString());
    assertFullScope(nextRun.executionId());
    assertThat(nextRun.revisionId())
        .isEqualTo(UUID.fromString(second.compileAttempt().path("revisionId").asText()));
    assertThat(executionCount(testId)).isEqualTo(2);
  }

  private AuthoringDtos.View awaitCandidate(UUID test, UUID request) throws Exception {
    long end = System.nanoTime() + Duration.ofSeconds(15).toNanos();
    while (System.nanoTime() < end) {
      JsonNode attempt = authoring.attempt(test, request, auth);
      if (!"RUNNING".equals(attempt.path("state").asText())) {
        assertThat(attempt.path("state").asText()).as(attempt.toString()).isEqualTo("CANDIDATE");
        return authoring.get(test, auth);
      }
      TimeUnit.MILLISECONDS.sleep(25);
    }
    throw new AssertionError("Synthetic compile did not settle");
  }

  private AuthoringDtos.Compile request(AuthoringDtos.View view, String mode) {
    return new AuthoringDtos.Compile(
        mode,
        view.test().sourceRevision(),
        view.test().configurationRevision(),
        view.authoringHash());
  }

  private AuthoringDtos.Confirm confirmation(AuthoringDtos.View view) {
    JsonNode attempt = view.compileAttempt();
    return new AuthoringDtos.Confirm(
        UUID.fromString(attempt.path("compileRequestId").asText()),
        UUID.fromString(attempt.path("revisionId").asText()),
        attempt.path("artifactHash").asText(),
        view.test().sourceRevision(),
        view.test().configurationRevision(),
        view.authoringHash());
  }

  private AuthoringDtos.Write write(UUID first, UUID last, String text, long source) {
    return new AuthoringDtos.Write(
        "Synthetic T1",
        null,
        "7241",
        "Production",
        List.of(new AuthoringDtos.Step(first, "Open example"), new AuthoringDtos.Step(last, text)),
        new AuthoringDtos.Scope("1.0.0", "STEP_SCOPED"),
        List.of(),
        TestConfiguration.defaults(),
        source,
        1L);
  }

  private int executionCount(UUID test) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM ui_test_executions WHERE ui_test_id = ?", Integer.class, test);
  }

  private void assertFullScope(UUID execution) {
    assertThat(
            jdbc.queryForObject(
                "SELECT execution_scope FROM ui_test_executions WHERE id = ?",
                String.class,
                execution))
        .isEqualTo("FULL");
  }

  private void seedAndCutover() throws Exception {
    jdbc.update(
        "INSERT INTO users(id,sso_id,name,email,is_active)"
            + " VALUES(gen_random_uuid(),'versioned-t1','T1','versioned-t1@citi.com',true)");
    jdbc.update(
        """
        INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment,status)
        VALUES('7241','Synthetic T1','Ops','HIGH','versioned-t1@citi.com','Production','OPERATIONAL')
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
}
