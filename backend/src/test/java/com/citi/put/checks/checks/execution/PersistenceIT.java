package com.citi.put.checks.checks.execution;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.execution.entity.ExecutionResult;
import com.citi.put.checks.checks.executors.ExecutionOutcome;
import com.citi.put.checks.checks.model.HttpConfiguration;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("local")
class PersistenceIT {

  @Autowired ExecutionPersistenceService persistenceService;
  @Autowired JdbcTemplate jdbc;

  @Test
  void persistOutcomeInsertsRowAndTriggerCascadesStatus() {
    String email = "persist-" + System.nanoTime() + "@citi.com";
    seedUser(email);
    String csiId = String.valueOf(System.nanoTime() % 100_000_000L);
    seedCsi(csiId, email);
    UUID checkId = seedCheck(csiId, email);

    Instant start = Instant.now();
    Instant end = start.plusMillis(150);
    ExecutionOutcome outcome =
        new ExecutionOutcome.Failure(Duration.ofMillis(150), "Bad status", null);

    HttpConfiguration config =
        new HttpConfiguration("HTTP", "GET", "http://test", null, null, 200, true, 5000, true);
    Check check = new Check("Test", "HTTP", null, csiId, "CSI", config, "Production", email);

    try {
      var field = Check.class.getDeclaredField("id");
      field.setAccessible(true);
      field.set(check, checkId);
    } catch (Exception e) {
      throw new RuntimeException(e);
    }

    UUID executionId = UUID.randomUUID();
    ExecutionResult result =
        persistenceService.persistResult(executionId, check, outcome, start, end);

    assertThat(result.getId()).isEqualTo(executionId);
    assertThat(result.getStatus()).isEqualTo("FAILURE");
    assertThat(result.getDurationMs()).isEqualTo(150);
    assertThat(result.getErrorMessage()).isEqualTo("Bad status");

    String cascadedStatus =
        jdbc.queryForObject("SELECT status FROM checks WHERE id = ?", String.class, checkId);
    assertThat(cascadedStatus).isEqualTo("FAILING");
  }

  private void seedUser(String email) {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Test', ?, ?, true)"
            + " ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + email,
        email,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi(String id, String ownerEmail) {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Test CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        id,
        ownerEmail,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  private UUID seedCheck(String csiId, String createdBy) {
    UUID checkId = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status, configuration,"
            + " created_by, created_at, updated_at)"
            + " VALUES (?, 'Persist Check', 'HTTP', ?, 'CSI', 'PENDING',"
            + " '{\"type\":\"HTTP\",\"method\":\"GET\",\"url\":\"http://test\"}', ?, ?, ?)",
        checkId,
        csiId,
        createdBy,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return checkId;
  }
}
