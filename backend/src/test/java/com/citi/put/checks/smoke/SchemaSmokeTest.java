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

@SpringBootTest
@ActiveProfiles("local")
@Transactional
class SchemaSmokeTest {

  @PersistenceContext
  private EntityManager em;

  @Autowired
  private JdbcTemplate jdbc;

  @Test
  void insertRoundtripAcrossCoreTables() {
    // users → csi_systems → checks — walks the primary FK chain.
    UserSmokeEntity user = new UserSmokeEntity();
    user.id = UUID.randomUUID();
    user.ssoId = "sso-" + UUID.randomUUID();
    user.name = "Alice Tester";
    user.email = "alice.tester+" + UUID.randomUUID() + "@citigroup.com";
    user.department = "PUT";
    user.createdAt = Instant.now();
    user.isActive = true;
    em.persist(user);

    CsiSystemSmokeEntity csi = new CsiSystemSmokeEntity();
    csi.id = "CSI-" + System.currentTimeMillis();
    csi.name = "Test CSI";
    csi.businessUnit = "Operations";
    csi.criticality = "HIGH";
    csi.ownerEmail = user.email;
    csi.environment = "Production";
    csi.status = "OPERATIONAL";
    csi.metadata = "{}";
    csi.createdAt = Instant.now();
    csi.updatedAt = Instant.now();
    em.persist(csi);

    CheckSmokeEntity check = new CheckSmokeEntity();
    check.id = UUID.randomUUID();
    check.name = "Smoke HTTP Check";
    check.type = "HTTP";
    check.csiId = csi.id;
    check.csiName = csi.name;
    check.status = "PENDING";
    check.configuration = "{\"type\":\"HTTP\",\"url\":\"https://example.com\",\"method\":\"GET\"}";
    check.createdBy = user.email;
    check.createdAt = Instant.now();
    check.updatedAt = Instant.now();
    em.persist(check);

    em.flush();
    em.clear();

    UserSmokeEntity readUser = em.find(UserSmokeEntity.class, user.id);
    CsiSystemSmokeEntity readCsi = em.find(CsiSystemSmokeEntity.class, csi.id);
    CheckSmokeEntity readCheck = em.find(CheckSmokeEntity.class, check.id);

    assertThat(readUser.email).isEqualTo(user.email);
    assertThat(readCsi.name).isEqualTo("Test CSI");
    assertThat(readCheck.type).isEqualTo("HTTP");
    assertThat(readCheck.configuration).contains("\"url\":\"https://example.com\"");
  }

  @Test
  void tablesFromMigrationAllExist() {
    Integer count = jdbc.queryForObject(
        "SELECT COUNT(*) FROM information_schema.tables "
            + "WHERE table_schema = 'public' "
            + "AND table_name IN ('users','csi_systems','checks','schedules','execution_results',"
            + "'ui_tests','ui_test_executions','reports','report_executions','tags',"
            + "'check_tags','csi_tags','secrets','shedlock')",
        Integer.class);
    assertThat(count).isEqualTo(14);
  }
}
