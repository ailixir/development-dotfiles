package com.citi.put.checks.studio.guided.publication;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Objects;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * The database wall clock, so replay grants are minted and judged on the same clock as the
 * observed-execution trigger, the dispatch CAS and the admission CAS (ADR-SC-005, STUDIO-OBS-012A
 * ruling R9). No application or runner clock can extend a grant.
 *
 * <p>Every {@link #instant()} is one {@code SELECT clock_timestamp()} round trip through the given
 * {@link JdbcTemplate}. It joins the caller's transaction if there is one and opens none if there
 * is not. Nothing is cached. It reads {@code clock_timestamp()}, never {@code now()}: {@code now()}
 * is frozen at transaction start, while acceptance binds after quota locks and Vault preflight. A
 * database failure propagates, so no grant is issued or accepted without the database (fail
 * closed).
 *
 * <p>Constructed only inside the two observed replay factory methods. It is not a Spring {@link
 * Clock} bean and must not replace the application clock.
 */
public final class DatabaseClock extends Clock {
  private final JdbcTemplate jdbc;
  private final ZoneId zone;

  public DatabaseClock(JdbcTemplate jdbc) {
    this(jdbc, ZoneOffset.UTC);
  }

  private DatabaseClock(JdbcTemplate jdbc, ZoneId zone) {
    this.jdbc = Objects.requireNonNull(jdbc);
    this.zone = Objects.requireNonNull(zone);
  }

  @Override
  public ZoneId getZone() {
    return zone;
  }

  @Override
  public Clock withZone(ZoneId value) {
    return zone.equals(value) ? this : new DatabaseClock(jdbc, value);
  }

  @Override
  public Instant instant() {
    return Objects.requireNonNull(
            jdbc.queryForObject("SELECT clock_timestamp()", Timestamp.class),
            "clock_timestamp() returned no value")
        .toInstant();
  }
}
