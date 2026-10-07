package com.citi.put.checks.smoke;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("local")
class IndexCatalogTest {

  private static final List<String> EXPECTED_INDEX_NAMES =
      List.of(
          "idx_users_sso_id",
          "idx_users_email",
          "idx_users_department",
          "idx_users_last_login",
          "idx_csi_business_unit",
          "idx_csi_status",
          "idx_csi_owner",
          "idx_csi_owner_status",
          "idx_checks_csi",
          "idx_checks_type",
          "idx_checks_status",
          "idx_checks_next_execution",
          "idx_checks_configuration",
          "idx_checks_created_by",
          "idx_checks_created_by_csi",
          "idx_schedules_check",
          "idx_schedules_enabled",
          "idx_execution_check_time",
          "idx_execution_status",
          "idx_ui_tests_csi",
          "idx_ui_tests_environment",
          "idx_ui_tests_created_by",
          "idx_ui_test_exec_test",
          "idx_ui_test_exec_check",
          "idx_reports_status",
          "idx_reports_last_sent",
          "idx_reports_created_by",
          "idx_reports_created_by_status",
          "idx_report_exec_report",
          "idx_check_tags_check",
          "idx_check_tags_tag",
          "idx_csi_tags_csi",
          "idx_csi_metrics_current_csi");

  @Autowired private JdbcTemplate jdbc;

  @Test
  void allExpectedIndexesArePresent() {
    List<String> actual =
        jdbc.queryForList(
            "SELECT indexname FROM pg_indexes WHERE schemaname = 'public'", String.class);
    assertThat(actual).containsAll(EXPECTED_INDEX_NAMES);
  }

  @Test
  void checksConfigurationGinIndexIsGin() {
    String indexDef =
        jdbc.queryForObject(
            "SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_checks_configuration'",
            String.class);
    assertThat(indexDef).containsIgnoringCase("USING gin");
  }
}
