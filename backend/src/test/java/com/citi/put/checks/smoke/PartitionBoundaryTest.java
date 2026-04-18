package com.citi.put.checks.smoke;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@ActiveProfiles("local")
@Transactional
class PartitionBoundaryTest {

  @Autowired private JdbcTemplate jdbc;

  private UUID checkId;

  @BeforeEach
  void seed() {
    String email = "part-" + UUID.randomUUID() + "@citigroup.com";
    String csiId = "CSI-part-" + System.nanoTime();
    checkId = UUID.randomUUID();

    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active) "
            + "VALUES (?, ?, 'Part User', ?, ?, true)",
        UUID.randomUUID(),
        "sso-" + UUID.randomUUID(),
        email,
        Timestamp.from(Instant.now()));

    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality,"
            + " owner_email, environment, status, created_at, updated_at) "
            + "VALUES (?, 'Part CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)",
        csiId,
        email,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));

    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status,"
            + " configuration, created_by, created_at, updated_at) "
            + "VALUES (?, 'Part Check', 'HTTP', ?, 'Part CSI', 'PENDING',"
            + " '{\"type\":\"HTTP\"}'::jsonb, ?, ?, ?)",
        checkId,
        csiId,
        email,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  @Test
  void insertWithinCurrentMonthPartitionSucceeds() {
    OffsetDateTime inBounds = OffsetDateTime.of(2026, 4, 15, 12, 0, 0, 0, ZoneOffset.UTC);
    jdbc.update(
        "INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, created_at) "
            + "VALUES (?, ?, 'SUCCESS', ?, ?, 100, ?)",
        UUID.randomUUID(),
        checkId,
        Timestamp.from(inBounds.toInstant()),
        Timestamp.from(inBounds.plusSeconds(1).toInstant()),
        Timestamp.from(Instant.now()));
  }

  @Test
  void insertSixMonthsOutIsRejected() {
    // No partition exists for Oct 2026 — V1 only bootstraps 2026-04 + 2026-05.
    OffsetDateTime farFuture = OffsetDateTime.of(2026, 10, 15, 12, 0, 0, 0, ZoneOffset.UTC);

    assertThatThrownBy(
            () ->
                jdbc.update(
                    "INSERT INTO execution_results (id, check_id, status,"
                        + " started_at, ended_at, duration_ms, created_at) "
                        + "VALUES (?, ?, 'SUCCESS', ?, ?, 100, ?)",
                    UUID.randomUUID(),
                    checkId,
                    Timestamp.from(farFuture.toInstant()),
                    Timestamp.from(farFuture.plusSeconds(1).toInstant()),
                    Timestamp.from(Instant.now())))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessageContaining("partition");
  }

  @Test
  void insertIntoNextMonthPartitionSucceeds() {
    OffsetDateTime mayDate = OffsetDateTime.of(2026, 5, 10, 0, 0, 0, 0, ZoneOffset.UTC);
    jdbc.update(
        "INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, created_at) "
            + "VALUES (?, ?, 'SUCCESS', ?, ?, 50, ?)",
        UUID.randomUUID(),
        checkId,
        Timestamp.from(mayDate.toInstant()),
        Timestamp.from(mayDate.plusSeconds(1).toInstant()),
        Timestamp.from(Instant.now()));
    // No exception = partition bound honored.
    LocalDate.of(2026, 5, 10); // silence unused-import tolerance
  }
}
