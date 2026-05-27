package com.citi.put.checks.reports;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.checks.dto.CheckDto;
import com.citi.put.checks.reports.section.RuleSection;
import com.citi.put.checks.reports.section.SectionResolver;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@ActiveProfiles("local")
@TestPropertySource(properties = "checks.reports.section-resolver-page-size=5")
class SectionResolverPaginationIT {

  @Autowired private SectionResolver sectionResolver;
  @Autowired private JdbcTemplate jdbc;

  private String csiId;

  @BeforeEach
  void setUp() {
    String email = "pagination-" + UUID.randomUUID() + "@citigroup.com";
    csiId = String.valueOf(System.nanoTime() % 100_000_000L);

    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active) "
            + "VALUES (?, ?, 'Pagination', ?, ?, true)",
        UUID.randomUUID(),
        "sso-" + UUID.randomUUID(),
        email,
        Timestamp.from(Instant.now()));

    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality,"
            + " owner_email, environment, status, created_at, updated_at) "
            + "VALUES (?, 'Pag CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)",
        csiId,
        email,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));

    for (int i = 0; i < 12; i++) {
      String status = i < 8 ? "PASSING" : "FAILING";
      jdbc.update(
          "INSERT INTO checks (id, name, type, csi_id, csi_name, status,"
              + " configuration, created_by, created_at, updated_at) "
              + "VALUES (?, ?, 'HTTP', ?, 'Pag CSI', ?,"
              + " '{\"type\":\"HTTP\",\"method\":\"GET\",\"url\":\"https://example.com/health\"}'::jsonb, ?, ?, ?)",
          UUID.randomUUID(),
          "Check-" + String.format("%02d", i),
          csiId,
          status,
          email,
          Timestamp.from(Instant.now()),
          Timestamp.from(Instant.now()));
    }
  }

  @Test
  void resolverReturnsLimitedResultsFromPaginatedQuery() {
    RuleSection.RuleConfig rule =
        new RuleSection.RuleConfig(List.of(csiId), null, List.of("HTTP"), null, null, null, 10);
    RuleSection section = new RuleSection("s1", "Paginated", rule);

    List<CheckDto> result = sectionResolver.resolve(section);

    assertThat(result).hasSize(10);
  }

  @Test
  void resolverRespectsLimitSmallerThanPageSize() {
    RuleSection.RuleConfig rule =
        new RuleSection.RuleConfig(List.of(csiId), null, List.of("HTTP"), null, null, null, 3);
    RuleSection section = new RuleSection("s1", "Small limit", rule);

    List<CheckDto> result = sectionResolver.resolve(section);

    assertThat(result).hasSize(3);
  }

  @Test
  void resolverAppliesStatusFilterAcrossPages() {
    RuleSection.RuleConfig rule =
        new RuleSection.RuleConfig(List.of(csiId), null, null, List.of("FAILING"), null, null, 100);
    RuleSection section = new RuleSection("s1", "Failing only", rule);

    List<CheckDto> result = sectionResolver.resolve(section);

    assertThat(result).hasSize(4);
    assertThat(result).allMatch(c -> "FAILING".equals(c.status()));
  }
}
