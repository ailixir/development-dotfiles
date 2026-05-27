package com.citi.put.checks.config;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.io.IOException;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile("local")
public class LocalEmbeddedPostgresConfig {

  private static final Logger LOGGER = LoggerFactory.getLogger(LocalEmbeddedPostgresConfig.class);

  @Bean(destroyMethod = "close")
  public EmbeddedPostgres embeddedPostgres() throws IOException {
    EmbeddedPostgres instance = EmbeddedPostgres.builder().start();
    LOGGER.info(
        "Zonky embedded PostgreSQL started on port {} — jdbc url: {}",
        instance.getPort(),
        instance.getJdbcUrl("postgres", "postgres"));
    return instance;
  }

  @Bean
  @Primary
  public DataSource dataSource(EmbeddedPostgres embeddedPostgres) {
    return embeddedPostgres.getPostgresDatabase();
  }
}
