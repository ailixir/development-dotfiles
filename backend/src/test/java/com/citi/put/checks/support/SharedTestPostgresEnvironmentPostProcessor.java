package com.citi.put.checks.support;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.PropertySource;

/**
 * Resolves {@value #URL_PROPERTY}, which {@code application-test.yml} uses as the datasource URL,
 * to the shared embedded test database. Registered in the test {@code META-INF/spring.factories},
 * so every Spring Boot context of the test JVM gets it: {@code @SpringBootTest} classes, second
 * application contexts and command-line runs alike. Like {@code random.*}, the source is lazy:
 * PostgreSQL starts only when a context actually resolves the property.
 */
public final class SharedTestPostgresEnvironmentPostProcessor implements EnvironmentPostProcessor {

  public static final String URL_PROPERTY = "checks.test.shared-postgres.url";

  @Override
  public void postProcessEnvironment(
      ConfigurableEnvironment environment, SpringApplication application) {
    environment
        .getPropertySources()
        .addLast(
            new PropertySource<>("sharedTestPostgres", URL_PROPERTY) {
              @Override
              public Object getProperty(String name) {
                return URL_PROPERTY.equals(name) ? SharedTestPostgres.testProfileJdbcUrl() : null;
              }
            });
  }
}
