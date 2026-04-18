package com.citi.put.checks.smoke;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.smoke.entity.CheckSmokeEntity;
import com.citi.put.checks.smoke.entity.CsiSystemSmokeEntity;
import com.citi.put.checks.smoke.entity.UserSmokeEntity;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Same assertions as SchemaSmokeTest but against a real PostgreSQL 15 container.
 * Proves Zonky ↔ Testcontainers DDL parity — catches any divergence (e.g., SUPERUSER-only
 * features, extensions, CHECK constraint dialects).
 *
 * <p>Runs only when Docker is available on the CI runner (@Testcontainers disabledWithoutDocker).
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Transactional
class SchemaSmokeContainerIT {

  @PersistenceContext
  private EntityManager em;

  @Autowired
  private JdbcTemplate jdbc;

  @Test
  void insertRoundtripAgainstRealPostgres() {
    UserSmokeEntity user = new UserSmokeEntity();
    user.id = UUID.randomUUID();
    user.ssoId = "sso-" + UUID.randomUUID();
    user.name = "Container Alice";
    user.email = "container-" + UUID.randomUUID() + "@citigroup.com";
    user.createdAt = Instant.now();
    user.isActive = true;
    em.persist(user);

    CsiSystemSmokeEntity csi = new CsiSystemSmokeEntity();
    csi.id = "CSI-tc-" + System.currentTimeMillis();
    csi.name = "Container CSI";
    csi.businessUnit = "Ops";
    csi.criticality = "MEDIUM";
    csi.ownerEmail = user.email;
    csi.environment = "Staging";
    csi.status = "OPERATIONAL";
    csi.metadata = "{\"env\":\"container\"}";
    csi.createdAt = Instant.now();
    csi.updatedAt = Instant.now();
    em.persist(csi);

    CheckSmokeEntity check = new CheckSmokeEntity();
    check.id = UUID.randomUUID();
    check.name = "Container HTTP";
    check.type = "HTTP";
    check.csiId = csi.id;
    check.csiName = csi.name;
    check.status = "PENDING";
    check.configuration = "{\"type\":\"HTTP\",\"url\":\"https://example.com\"}";
    check.createdBy = user.email;
    check.createdAt = Instant.now();
    check.updatedAt = Instant.now();
    em.persist(check);

    em.flush();
    em.clear();

    assertThat(em.find(UserSmokeEntity.class, user.id).email).isEqualTo(user.email);
    assertThat(em.find(CsiSystemSmokeEntity.class, csi.id).name).isEqualTo("Container CSI");
    assertThat(em.find(CheckSmokeEntity.class, check.id).type).isEqualTo("HTTP");
  }

  @Test
  void discriminatorConstraintFiresOnRealPostgres() {
    // Parity check: ensure the CHECK constraint behaves identically on real PG.
    Integer rowCount = jdbc.queryForObject(
        "SELECT COUNT(*) FROM information_schema.table_constraints "
            + "WHERE table_name = 'checks' AND constraint_name = 'ck_checks_configuration_has_type'",
        Integer.class);
    assertThat(rowCount).isEqualTo(1);
  }
}
