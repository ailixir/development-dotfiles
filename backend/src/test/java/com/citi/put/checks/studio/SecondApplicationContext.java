package com.citi.put.checks.studio;

import com.citi.put.checks.ChecksApplication;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * A second, independent Spring application context against the <b>same database</b>.
 *
 * <p>Production runs three API replicas scaling to six. Every durability claim in story 10.7 is a
 * claim about what happens when two of them act at once, and a single-context test cannot make it:
 * two beans in one context share caches, one Hibernate session factory and one JVM's worth of
 * in-memory state, so a guard that is really a private field passes anyway.
 *
 * <p><b>The datasource is resolved from the first context rather than from configuration.</b> The
 * obvious construction — start a second context on the same {@code test} profile and let it read
 * the same {@code jdbc:tc:...} URL — produces a <em>second container</em>: the Testcontainers JDBC
 * driver hands out a fresh database, and the second context then sees an empty schema. A test built
 * that way passes or fails for reasons that have nothing to do with the guard under test, and it
 * would have "proved" cross-replica behaviour against two unrelated databases. So the live URL is
 * read off the first context's connection and handed to the second, and Flyway is off on the second
 * because the schema is already there.
 */
public final class SecondApplicationContext implements AutoCloseable {

  private final ConfigurableApplicationContext context;

  public SecondApplicationContext(DataSource sharedWith) {
    // Touch the first context's datasource so its container is definitely up before the second
    // context asks the Testcontainers driver for the same URL.
    try (java.sql.Connection connection = sharedWith.getConnection()) {
      connection.getMetaData().getURL();
    } catch (SQLException e) {
      throw new IllegalStateException("The first context's database is not reachable", e);
    }
    this.context =
        new SpringApplicationBuilder(ChecksApplication.class)
            .web(WebApplicationType.SERVLET)
            // Command-line arguments, not SpringApplicationBuilder.properties()/profiles():
            // those are *default* properties and sit below application.yml, whose
            // `spring.profiles.active: local` would otherwise stay on and hand this context a
            // Zonky embedded Postgres of its own. Both symptoms — a second Testcontainers
            // database and a second embedded one — look identical from the outside: the second
            // context simply sees an empty schema, and a cross-replica test built on it would
            // have been comparing two unrelated databases.
            .run(
                "--spring.profiles.active=test",
                "--server.port=0",
                // No datasource override: application-test.yml's Testcontainers JDBC URL is
                // cached by the driver per JVM, so the second context attaches to the *same*
                // container. Handing it a resolved host:port instead looks equivalent and is not:
                // it survives only as long as that exact container, and a context eviction or a
                // restart turns it into "Connection refused" in the suite while passing in
                // isolation.
                //
                // The schema is already migrated by the first context; running Flyway again here
                // is at best a no-op and at worst a race between two contexts starting together.
                "--spring.flyway.enabled=false",
                // Several contexts share one container; a 30-connection default each
                // is how a suite exhausts max_connections.
                "--spring.datasource.hikari.maximum-pool-size=5");
  }

  public <T> T bean(Class<T> type) {
    return context.getBean(type);
  }

  public ConfigurableApplicationContext raw() {
    return context;
  }

  /** The port the second context's servlet container is listening on. */
  public int port() {
    return Integer.parseInt(context.getEnvironment().getProperty("local.server.port", "0"));
  }

  @Override
  public void close() {
    context.close();
  }
}
