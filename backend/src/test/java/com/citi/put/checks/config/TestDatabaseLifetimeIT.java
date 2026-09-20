package com.citi.put.checks.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.DriverManager;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.ClassPathResource;
import org.testcontainers.junit.jupiter.Testcontainers;

/** Real JDBC connection churn must not reset the database used by cached Spring contexts. */
@Testcontainers(disabledWithoutDocker = true)
class TestDatabaseLifetimeIT {
  @Test
  void closingAllConnectionsDoesNotResetTheConfiguredTestDatabase() throws Exception {
    var properties =
        new YamlPropertySourceLoader()
            .load("test", new ClassPathResource("application-test.yml"))
            .getFirst();
    String url = String.valueOf(properties.getProperty("spring.datasource.url"));
    String table = "lifetime_" + UUID.randomUUID().toString().replace("-", "");
    String physicalUrl;
    try (var connection = DriverManager.getConnection(url, "test", "test");
        var statement = connection.createStatement()) {
      physicalUrl = connection.getMetaData().getURL();
      statement.execute("CREATE TABLE " + table + " (value integer)");
      statement.execute("INSERT INTO " + table + " VALUES (27)");
    }
    // No connection is left open. The default non-daemon JDBC behavior would start an empty DB.
    try (var workers = Executors.newFixedThreadPool(2)) {
      var read =
          (java.util.concurrent.Callable<Void>)
              () -> {
                for (int i = 0; i < 10; i++) {
                  try (var connection = DriverManager.getConnection(url, "test", "test");
                      var statement = connection.createStatement();
                      var rows = statement.executeQuery("SELECT value FROM " + table)) {
                    assertThat(connection.getMetaData().getURL()).isEqualTo(physicalUrl);
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getInt(1)).isEqualTo(27);
                  }
                }
                return null;
              };
      var first = workers.submit(read);
      var second = workers.submit(read);
      first.get(20, TimeUnit.SECONDS);
      second.get(20, TimeUnit.SECONDS);
    } finally {
      try (var connection = DriverManager.getConnection(url, "test", "test");
          var statement = connection.createStatement()) {
        statement.execute("DROP TABLE " + table);
      }
    }
  }
}
