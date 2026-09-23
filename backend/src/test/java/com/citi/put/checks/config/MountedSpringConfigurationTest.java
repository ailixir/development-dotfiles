package com.citi.put.checks.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.checks.model.CheckType;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.EnumerablePropertySource;
import org.springframework.core.env.SystemEnvironmentPropertySource;
import org.springframework.core.io.FileSystemResource;

class MountedSpringConfigurationTest {
  @TempDir Path directory;

  @Configuration(proxyBeanMethods = false)
  @EnableConfigurationProperties(SourceConcurrencyProperties.class)
  static class Binding {}

  private Path configuration() throws Exception {
    var source =
        (EnumerablePropertySource<?>)
            new YamlPropertySourceLoader()
                .load(
                    "production",
                    new FileSystemResource("../helm-chart/put-checks/values-prod.yaml"))
                .getFirst();
    String prefix = "worker.configOverrides.";
    StringBuilder yaml = new StringBuilder();
    for (String key : source.getPropertyNames()) {
      if (key.startsWith(prefix)) {
        yaml.append(key.substring(prefix.length()))
            .append(": \"")
            .append(source.getProperty(key))
            .append("\"\n");
      }
    }
    Path file = directory.resolve("application.yaml");
    Files.writeString(file, yaml);
    return file;
  }

  private ApplicationContextRunner context(Path file, Map<String, Object> environment) {
    Map<String, Object> processEnvironment = new LinkedHashMap<>(environment);
    processEnvironment.put("SPRING_CONFIG_ADDITIONAL_LOCATION", file.toUri().toString());
    return new ApplicationContextRunner()
        .withInitializer(
            context ->
                context
                    .getEnvironment()
                    .getPropertySources()
                    .addFirst(
                        new SystemEnvironmentPropertySource(
                            "systemEnvironment", processEnvironment)))
        .withInitializer(new ConfigDataApplicationContextInitializer())
        .withUserConfiguration(Binding.class);
  }

  @Test
  void mountedProductionPropertiesBindDottedHyphenatedAndEnumMapKeys() throws Exception {
    context(configuration(), Map.of())
        .run(
            context -> {
              assertThat(context).hasNotFailed();
              var limits = context.getBean(SourceConcurrencyProperties.class);
              assertThat(limits.maxConcurrency()).isEqualTo(250);
              assertThat(limits.sourceLimits().get(CheckType.HTTP)).isEqualTo(150);
              assertThat(limits.sourceLimits().get(CheckType.UI_TEST)).isEqualTo(25);
              assertThat(
                      context
                          .getEnvironment()
                          .getProperty("spring.datasource.hikari.maximum-pool-size", Integer.class))
                  .isEqualTo(30);
              assertThat(
                      context
                          .getEnvironment()
                          .getProperty("checks.scheduling.min-interval-seconds", Integer.class))
                  .isEqualTo(60);
            });
  }

  @Test
  void canonicalEnvironmentValuesOverrideMountedValuesWithoutLosingMapKeys() throws Exception {
    Map<String, Object> environment = new LinkedHashMap<>();
    environment.put("CHECKS_EXECUTOR_MAXCONCURRENCY", "311");
    environment.put("CHECKS_EXECUTOR_SOURCELIMITS_HTTP", "137");
    context(configuration(), environment)
        .run(
            context -> {
              assertThat(context).hasNotFailed();
              var limits = context.getBean(SourceConcurrencyProperties.class);
              assertThat(limits.maxConcurrency()).isEqualTo(311);
              assertThat(limits.sourceLimits().get(CheckType.HTTP)).isEqualTo(137);
              assertThat(limits.sourceLimits().get(CheckType.UI_TEST)).isEqualTo(25);
            });
  }

  @Test
  void missingRequiredMountFailsInsteadOfQuietlyRunningDefaults() {
    context(directory.resolve("missing.yaml"), Map.of())
        .run(context -> assertThat(context).hasFailed());
  }
}
