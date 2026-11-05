package com.citi.put.checks.support;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * A fresh database in the JVM's {@link SharedTestPostgres}, standing in for a per-class PostgreSQL
 * container: {@link #start()} creates it empty, {@link #stop()} drops it and ends its connections.
 * The accessors match the container's, so a test only changes the type.
 *
 * <p>Without {@link #withDatabaseName} the name is unique in the JVM. A named database is dropped
 * and recreated on start, so the same name in a later class also starts empty. Roles and other
 * cluster-wide objects are shared with the other classes of the JVM.
 */
public final class TestPostgresDatabase implements AutoCloseable {

  private static final AtomicInteger SEQUENCE = new AtomicInteger();

  private String databaseName = "test_" + SEQUENCE.incrementAndGet();
  private boolean started;

  public TestPostgresDatabase withDatabaseName(String name) {
    if (started) {
      throw new IllegalStateException("Name a test database before starting it");
    }
    this.databaseName = name;
    return this;
  }

  public synchronized void start() {
    if (!started) {
      SharedTestPostgres.execute("DROP DATABASE IF EXISTS " + databaseName + " WITH (FORCE)");
      SharedTestPostgres.execute("CREATE DATABASE " + databaseName);
      started = true;
    }
  }

  public synchronized void stop() {
    if (started) {
      started = false;
      SharedTestPostgres.execute("DROP DATABASE IF EXISTS " + databaseName + " WITH (FORCE)");
    }
  }

  public synchronized boolean isRunning() {
    return started;
  }

  @Override
  public void close() {
    stop();
  }

  public String getJdbcUrl() {
    return SharedTestPostgres.jdbcUrl(databaseName);
  }

  public String getDatabaseName() {
    return databaseName;
  }

  public String getUsername() {
    return SharedTestPostgres.USERNAME;
  }

  public String getPassword() {
    return SharedTestPostgres.PASSWORD;
  }

  public String getHost() {
    return SharedTestPostgres.HOST;
  }

  public int getPort() {
    return SharedTestPostgres.port();
  }
}
