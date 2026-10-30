package com.citi.put.checks.studio.guided;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.function.Consumer;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;

class GuidedChildLocatorMigrationIT {
  static void database(Consumer<JdbcTemplate> test) {
    try (var pg = new PostgreSQLContainer<>("postgres:15-alpine")) {
      pg.start();
      var source = new DriverManagerDataSource(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword());
      Flyway.configure().dataSource(source).load().migrate();
      test.accept(new JdbcTemplate(source));
    }
  }

  @Test
  void childGrammarAndActualOperationAreEnforcedByForwardSql() {
    database(
        jdbc -> {
          String child =
              "[{\"by\":\"role\",\"role\":\"region\"},{\"by\":\"filterHas\""
                  + ",\"relation\":\"child\",\"has\":[{\"by\":\"role\",\"role\":"
                  + "\"heading\",\"name\":\"About\",\"exact\":true}]},{\"by\":\"r"
                  + "ole\",\"role\":\"paragraph\"}]";
          assertThat(
                  jdbc.queryForObject(
                      "SELECT studio_wi6_locator(?::jsonb,'read')", Boolean.class, child))
              .isTrue();
          assertThat(
                  jdbc.queryForObject(
                      "SELECT studio_wi6_locator(?::jsonb,'assert')", Boolean.class, child))
              .isTrue();
          for (String operation :
              java.util.List.of(
                  "click",
                  "hover",
                  "press",
                  "fill",
                  "selectOption",
                  "check",
                  "uncheck",
                  "navigate",
                  "")) {
            assertThat(
                    jdbc.queryForObject(
                        "SELECT studio_wi6_locator(?::jsonb,?)", Boolean.class, child, operation))
                .as(operation)
                .isFalse();
          }
          for (String invalid :
              java.util.List.of(
                  child.replace("\"child\"", "\"descendant\""),
                  child.replace("\"exact\":true", "\"exact\":false"),
                  child.replace("\"role\":\"heading\"", "\"role\":\"heading\",\"unknown\":true"))) {
            assertThat(
                    jdbc.queryForObject(
                        "SELECT studio_wi6_locator(?::jsonb,'read')", Boolean.class, invalid))
                .isFalse();
          }
          assertThat(
                  jdbc.queryForObject(
                      "SELECT studio_wi6_locator(?::jsonb,'click')",
                      Boolean.class,
                      child.replace("\"relation\":\"child\",", "")))
              .isTrue();
        });
  }
}
