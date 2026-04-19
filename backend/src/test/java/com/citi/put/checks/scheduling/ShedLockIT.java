package com.citi.put.checks.scheduling;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.javacrumbs.shedlock.core.LockConfiguration;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.core.SimpleLock;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class ShedLockIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired JdbcTemplate jdbc;
  @Autowired LockProvider lockProvider;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  @BeforeEach
  void setUp() {
    jdbc.update("DELETE FROM shedlock");
  }

  @Test
  void lockProviderAcquiresAndReleasesLock() {
    LockConfiguration config =
        new LockConfiguration(Instant.now(), "testLock", Duration.ofMinutes(5), Duration.ZERO);

    Optional<SimpleLock> lock = lockProvider.lock(config);
    assertThat(lock).isPresent();

    List<Map<String, Object>> rows =
        jdbc.queryForList("SELECT * FROM shedlock WHERE name = 'testLock'");
    assertThat(rows).hasSize(1);
    assertThat(rows.get(0).get("locked_by")).isNotNull();

    lock.get().unlock();
  }

  @Test
  void secondLockAttemptFailsWhileFirstHeld() {
    LockConfiguration config =
        new LockConfiguration(
            Instant.now(), "exclusiveLock", Duration.ofMinutes(5), Duration.ofMinutes(1));

    Optional<SimpleLock> first = lockProvider.lock(config);
    assertThat(first).as("First lock should succeed").isPresent();

    Optional<SimpleLock> second = lockProvider.lock(config);
    assertThat(second).as("Second lock should fail while first is held").isEmpty();

    first.get().unlock();
  }

  @Test
  void shedLockTableHasExpectedSchema() {
    List<Map<String, Object>> columns =
        jdbc.queryForList(
            """
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'shedlock'
            ORDER BY ordinal_position
            """);

    assertThat(columns).hasSize(4);
    assertThat(columns.get(0).get("column_name")).isEqualTo("name");
    assertThat(columns.get(1).get("column_name")).isEqualTo("lock_until");
    assertThat(columns.get(2).get("column_name")).isEqualTo("locked_at");
    assertThat(columns.get(3).get("column_name")).isEqualTo("locked_by");
  }
}
