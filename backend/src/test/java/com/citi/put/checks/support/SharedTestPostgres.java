package com.citi.put.checks.support;

import com.citi.put.checks.config.LocalEmbeddedPostgresConfig;
import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * The one embedded PostgreSQL 15.6 of a test JVM (Zonky; no Docker, so it runs on Windows too).
 *
 * <p>It starts on first use, with the builder settings of {@link LocalEmbeddedPostgresConfig}
 * ({@code locale=C}, a port outside the ephemeral ranges). Zonky registers a shutdown hook that
 * stops the postmaster and removes its data directory when the JVM exits. The {@code test} profile
 * datasource uses its {@value #TEST_PROFILE_DATABASE} database; {@link TestPostgresDatabase} gives
 * a test class a fresh database of its own in the same instance.
 */
public final class SharedTestPostgres {

  /** The database every {@code test}-profile context shares, as the one test container did. */
  public static final String TEST_PROFILE_DATABASE = "checks";

  /** The cluster superuser. Zonky's initdb uses trust authentication, so no password is checked. */
  public static final String USERNAME = "postgres";

  public static final String PASSWORD = "postgres";

  public static final String HOST = "localhost";

  private SharedTestPostgres() {}

  private static final class Instance {
    static final EmbeddedPostgres POSTGRES = start();

    private static EmbeddedPostgres start() {
      try {
        EmbeddedPostgres postgres = new LocalEmbeddedPostgresConfig().embeddedPostgres();
        execute(postgres, "CREATE DATABASE " + TEST_PROFILE_DATABASE);
        return postgres;
      } catch (IOException e) {
        throw new UncheckedIOException("Failed to start the embedded test PostgreSQL", e);
      }
    }
  }

  public static int port() {
    return Instance.POSTGRES.getPort();
  }

  /** Same shape as the Testcontainers URL ({@code ?loggerLevel=OFF}), so callers may append. */
  public static String jdbcUrl(String database) {
    return "jdbc:postgresql://" + HOST + ":" + port() + "/" + database + "?loggerLevel=OFF";
  }

  public static String testProfileJdbcUrl() {
    return jdbcUrl(TEST_PROFILE_DATABASE);
  }

  /** Runs one statement as the superuser on the maintenance database. */
  static void execute(String sql) {
    execute(Instance.POSTGRES, sql);
  }

  private static void execute(EmbeddedPostgres postgres, String sql) {
    try (Connection connection = postgres.getPostgresDatabase().getConnection();
        Statement statement = connection.createStatement()) {
      statement.execute(sql);
    } catch (SQLException e) {
      throw new IllegalStateException("Embedded test PostgreSQL refused: " + sql, e);
    }
  }
}
