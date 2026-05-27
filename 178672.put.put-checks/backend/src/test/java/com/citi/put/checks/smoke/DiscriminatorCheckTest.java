package com.citi.put.checks.smoke;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.time.Instant;
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
class DiscriminatorCheckTest {

  @Autowired private JdbcTemplate jdbc;

  private String userEmail;
  private String csiId;

  @BeforeEach
  void seed() {
    userEmail = "disc-" + UUID.randomUUID() + "@citigroup.com";
    csiId = String.valueOf(System.nanoTime() % 100_000_000L);

    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active) "
            + "VALUES (?, ?, ?, ?, ?, true)",
        UUID.randomUUID(),
        "sso-" + UUID.randomUUID(),
        "Disc User",
        userEmail,
        Timestamp.from(Instant.now()));

    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality,"
            + " owner_email, environment, status, created_at, updated_at) "
            + "VALUES (?, 'Disc CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)",
        csiId,
        userEmail,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  @Test
  void insertingConfigurationWithoutTypeKeyViolatesCheckConstraint() {
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "INSERT INTO checks (id, name, type, csi_id, csi_name,"
                        + " status, configuration, created_by,"
                        + " created_at, updated_at) "
                        + "VALUES (?, 'Bad Check', 'HTTP', ?, 'Disc CSI',"
                        + " 'PENDING', '{\"foo\":1}'::jsonb, ?, ?, ?)",
                    UUID.randomUUID(),
                    csiId,
                    userEmail,
                    Timestamp.from(Instant.now()),
                    Timestamp.from(Instant.now())))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessageContaining("ck_checks_configuration_has_type");
  }

  @Test
  void insertingConfigurationWithTypeKeySucceeds() {
    jdbc.update(
        "INSERT INTO checks (id, name, type, csi_id, csi_name, status,"
            + " configuration, created_by, created_at, updated_at) "
            + "VALUES (?, 'Good Check', 'HTTP', ?, 'Disc CSI', 'PENDING',"
            + " '{\"type\":\"HTTP\",\"method\":\"GET\",\"url\":\"https://example.com/health\"}'::jsonb, ?, ?, ?)",
        UUID.randomUUID(),
        csiId,
        userEmail,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}
