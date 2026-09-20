package com.citi.put.checks.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

/**
 * Studio v1 WP10 (plan ADD-2): an open ED-02 identity bypass is unbootable outside local/dev/test.
 *
 * <p>The contexts below bind the real {@link IdentityBypassProperties} from property values and
 * construct the real {@link IdentityBypassProfileGuard}, so what is asserted is "this context
 * refuses to refresh" — not a predicate evaluated in isolation. What the filter does with each flag
 * open or closed is {@code BffSessionBypassClosureTest}'s subject and is not repeated here.
 */
class IdentityBypassProfileGuardTest {

  @Configuration(proxyBeanMethods = false)
  @EnableConfigurationProperties(IdentityBypassProperties.class)
  @Import(IdentityBypassProfileGuard.class)
  static class GuardOnly {}

  private static ApplicationContextRunner context(String... profiles) {
    return new ApplicationContextRunner()
        .withUserConfiguration(GuardOnly.class)
        .withInitializer(ctx -> ctx.getEnvironment().setActiveProfiles(profiles));
  }

  @Nested
  class FailClosedByDefault {

    @Test
    void withNothingConfiguredEveryBypassIsClosedAndProductionStarts() {
      context("api", "prod")
          .run(
              ctx -> {
                assertThat(ctx).hasNotFailed();
                assertThat(ctx.getBean(IdentityBypassProperties.class))
                    .isEqualTo(IdentityBypassProperties.closed());
              });
    }
  }

  @Nested
  class RefusedOutsideDevelopment {

    @Test
    void coreServiceBypassUnderProdRefusesToStart() {
      context("api", "prod")
          .withPropertyValues("checks.security.bypass.core-service=true")
          .run(ctx -> assertRefused(ctx.getStartupFailure(), "core-service", "prod"));
    }

    @Test
    void csiReadBypassUnderStagingRefusesToStart() {
      context("api", "staging")
          .withPropertyValues("checks.security.bypass.csi-read=true")
          .run(ctx -> assertRefused(ctx.getStartupFailure(), "csi-read", "staging"));
    }

    @Test
    void identityHeadersUnderProdRefusesToStart() {
      context("prod")
          .withPropertyValues("checks.security.bypass.identity-headers=true")
          .run(ctx -> assertRefused(ctx.getStartupFailure(), "identity-headers", "prod"));
    }

    @Test
    void aDevelopmentProfileDoesNotLaunderADeployedOne() {
      context("dev", "prod")
          .withPropertyValues("checks.security.bypass.core-service=true")
          .run(ctx -> assertRefused(ctx.getStartupFailure(), "core-service", "prod"));
    }

    @Test
    void aRoleProfileAloneIsNotADevelopmentProfile() {
      context("worker")
          .withPropertyValues("checks.security.bypass.core-service=true")
          .run(ctx -> assertRefused(ctx.getStartupFailure(), "core-service", "worker"));
    }

    @Test
    void noActiveProfileAtAllIsRefused() {
      context()
          .withPropertyValues("checks.security.bypass.csi-read=true")
          .run(ctx -> assertRefused(ctx.getStartupFailure(), "csi-read", "[]"));
    }
  }

  @Nested
  class AllowedUnderDevelopment {

    @Test
    void theChartsDevRenderingMayOpenTheBypass() {
      context("api", "dev")
          .withPropertyValues(
              "checks.security.bypass.core-service=true", "checks.security.bypass.csi-read=true")
          .run(
              ctx -> {
                assertThat(ctx).hasNotFailed();
                assertThat(ctx.getBean(IdentityBypassProperties.class).coreService()).isTrue();
              });
    }

    @Test
    void localAndTestMayOpenTheBypass() {
      for (String profile : new String[] {"local", "test"}) {
        context(profile)
            .withPropertyValues("checks.security.bypass.identity-headers=true")
            .run(ctx -> assertThat(ctx).hasNotFailed());
      }
    }
  }

  /**
   * The profile files a deployment actually loads open nothing. The chart side — every rendered
   * value set sets all three to false — is asserted in {@code
   * studio-runner/test/deployment/edge.test.ts}.
   */
  @Nested
  class DeployedProfileFiles {

    @Test
    void stagingAndProdProfileFilesOpenNoBypass() throws Exception {
      for (String file : new String[] {"application-staging.yml", "application-prod.yml"}) {
        assertThat(bind(file)).as(file).isEqualTo(IdentityBypassProperties.closed());
      }
    }

    @Test
    void theDevProfileFileOpensNoBypassEither() throws Exception {
      // The chart deploys `api,dev`. An open flag in this file would outrank the chart's
      // CHECKS_BYPASS_* variables, which application.yml reads, so it stays closed here too.
      assertThat(bind("application-dev.yml")).isEqualTo(IdentityBypassProperties.closed());
    }

    private IdentityBypassProperties bind(String file) throws Exception {
      Map<String, Object> flat = new HashMap<>();
      for (PropertySource<?> source :
          new YamlPropertySourceLoader().load(file, new ClassPathResource(file))) {
        if (source.getSource() instanceof Map<?, ?> map) {
          map.forEach((key, value) -> flat.put(String.valueOf(key), value));
        }
      }
      return new Binder(new MapConfigurationPropertySource(flat))
          .bindOrCreate("checks.security.bypass", IdentityBypassProperties.class);
    }
  }

  private static void assertRefused(Throwable failure, String flag, String profile) {
    assertThat(failure).isNotNull();
    Throwable root = failure;
    while (root.getCause() != null) {
      root = root.getCause();
    }
    assertThat(root)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("checks.security.bypass." + flag)
        .hasMessageContaining(profile)
        .hasMessageContaining("Refusing to start");
  }
}
