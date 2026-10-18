package com.citi.put.checks.studio.guided;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;

import com.citi.put.checks.ChecksApplication;
import com.citi.put.checks.scheduling.SchedulingCoordinator;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.dispatch.StudioRunnerTls;
import com.citi.put.checks.studio.guided.bridge.GuidedDispatchService;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationConfiguration;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedInternalSecurity;
import com.citi.put.checks.studio.guided.session.GuidedSessionReaper;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.citi.put.checks.studio.guided.translation.CredentialPatternScreen;
import com.citi.put.checks.studio.guided.translation.GuidedLlmGatewayClient;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationConfiguration;
import com.citi.put.checks.studio.guided.translation.GuidedTranslationCoordinator;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.stream.Stream;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.convert.ApplicationConversionService;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * STUDIO-OBS-009 AC-5 (architect ruling A5): the two {@code @Scheduled} guided beans run on the
 * scheduler role, not on every API replica.
 *
 * <p>{@code GuidedSessionReaper} is a scanned component, so its gate is a class-level
 * {@code @Profile}. {@code GuidedTranslationCoordinator} is built by a {@code @Bean} method, where
 * a class-level {@code @Profile} on the coordinator would be ignored, so the gate sits on the
 * method. Both use the expression of {@code SchedulingCoordinator}: {@code "!api | worker"}.
 *
 * <p>Three layers, each failing on its own:
 *
 * <ul>
 *   <li>annotation pins: the expression is the scheduler's, and no {@code "!worker"} bean was
 *       widened (prohibited by the lane);
 *   <li>the role matrix over the real configuration classes with stand-in collaborators, for the
 *       profile sets the ruling names (absent for {@code {api,prod}} and {@code {api,staging}},
 *       present for {@code {worker,prod}}, {@code {local}} and {@code {test}}, and the neighbours
 *       that pin the edges);
 *   <li>two real application contexts: the {@code worker} context builds the reaper and the
 *       coordinator and runs a reaper pass against the database (the A5 exit condition), and the
 *       {@code api} context has neither.
 * </ul>
 */
class GuidedScheduledBeansProfileTest {

  private static final String SCHEDULER_ROLE = "!api | worker";

  // ---- annotation pins ----

  @Test
  void bothGatesUseTheExpressionOfTheSchedulingCoordinator() throws Exception {
    String[] scheduler = SchedulingCoordinator.class.getAnnotation(Profile.class).value();

    assertThat(scheduler).containsExactly(SCHEDULER_ROLE);
    assertThat(GuidedSessionReaper.class.getAnnotation(Profile.class).value())
        .containsExactly(SCHEDULER_ROLE);
    assertThat(coordinatorMethod().getAnnotation(Profile.class).value())
        .containsExactly(SCHEDULER_ROLE);
  }

  @Test
  void theCoordinatorGateIsOnTheBeanMethodBecauseTheClassIsNotScanned() {
    // A class-level @Profile on the coordinator would never be read: it is a bean method's product.
    assertThat(GuidedTranslationCoordinator.class.getAnnotation(Profile.class)).isNull();
    assertThat(
            GuidedTranslationCoordinator.class.getAnnotation(
                org.springframework.stereotype.Component.class))
        .isNull();
  }

  @Test
  void noNotWorkerBeanWasWidened() {
    assertThat(GuidedInternalSecurity.class.getAnnotation(Profile.class).value())
        .containsExactly("!worker");
    assertThat(GuidedPublicationConfiguration.class.getAnnotation(Profile.class).value())
        .containsExactly("!worker");
  }

  // ---- the role matrix ----

  static Stream<Arguments> roles() {
    return Stream.of(
        // The ruling's named sets.
        Arguments.of("api,prod", false),
        Arguments.of("api,staging", false),
        Arguments.of("worker,prod", true),
        Arguments.of("local", true),
        Arguments.of("test", true),
        // The edges: the role decides, the environment profile does not.
        Arguments.of("api", false),
        Arguments.of("api,dev", false),
        Arguments.of("local,api", false),
        Arguments.of("api,test", false),
        Arguments.of("worker", true),
        Arguments.of("worker,staging", true),
        Arguments.of("worker,api", true),
        Arguments.of("prod", true),
        Arguments.of("dev", true));
  }

  @ParameterizedTest(name = "reaper under {0}: present={1}")
  @MethodSource("roles")
  void theReaperFollowsTheRoleMatrix(String profiles, boolean present) {
    try (var context = new AnnotationConfigApplicationContext()) {
      context.getEnvironment().setActiveProfiles(profiles.split(","));
      context
          .getBeanFactory()
          .setConversionService(ApplicationConversionService.getSharedInstance());
      context.registerBean(GuidedSessionService.class, () -> mock(GuidedSessionService.class));
      context.register(GuidedSessionReaper.class);
      context.refresh();

      assertThat(context.getBeansOfType(GuidedSessionReaper.class)).hasSize(present ? 1 : 0);
    }
  }

  @ParameterizedTest(name = "coordinator under {0}: present={1}")
  @MethodSource("roles")
  void theCoordinatorFollowsTheRoleMatrix(String profiles, boolean present) {
    try (var context = new AnnotationConfigApplicationContext()) {
      context.getEnvironment().setActiveProfiles(profiles.split(","));
      context
          .getBeanFactory()
          .setConversionService(ApplicationConversionService.getSharedInstance());
      collaborators(context);
      context.register(GuidedTranslationConfiguration.class);
      context.refresh();

      assertThat(context.getBeansOfType(GuidedTranslationCoordinator.class))
          .hasSize(present ? 1 : 0);
      // The rest of the translation configuration is not role-gated.
      assertThat(
              context.getBeansOfType(
                  com.citi.put.checks.studio.guided.translation.GuidedTranslationStore.class))
          .hasSize(1);
    }
  }

  @Test
  void theMatrixIsNotVacuous() {
    // Both outcomes occur, and the gate is the only thing that differs between two of the rows.
    assertThat(roles().map(row -> row.get()[1]).distinct().count()).isEqualTo(2);
  }

  // ---- real application contexts ----

  /** The scheduler role: the full application builds both graphs and the reaper pass runs. */
  @Nested
  @SpringBootTest(classes = ChecksApplication.class)
  @ActiveProfiles({"test", "worker"})
  @Testcontainers(disabledWithoutDocker = true)
  @DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
  class WorkerRole {
    @Autowired ApplicationContext context;
    @Autowired GuidedSessionReaper reaper;
    @Autowired GuidedTranslationCoordinator coordinator;

    @Test
    void theWorkerContextBuildsTheReaperAndCoordinatorGraphAndRunsAReaperPass() {
      assertThat(context.getBeansOfType(GuidedSessionReaper.class)).hasSize(1);
      assertThat(context.getBeansOfType(GuidedTranslationCoordinator.class)).hasSize(1);
      assertThat(context.getEnvironment().getActiveProfiles())
          .containsExactlyInAnyOrder("test", "worker");
      // The worker has no publication lifecycle (GuidedPublicationConfiguration is !worker); an
      // expiry pass over the real database must not need it.
      assertThatCode(reaper::expire).doesNotThrowAnyException();
      assertThat(coordinator).isNotNull();
    }
  }

  /** The API role: neither timer exists, so replicas do not multiply them. */
  @Nested
  @SpringBootTest(classes = ChecksApplication.class)
  @ActiveProfiles({"test", "api"})
  @Testcontainers(disabledWithoutDocker = true)
  @DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
  class ApiRole {
    @Autowired ApplicationContext context;

    @Test
    void theApiContextHasNeitherScheduledGuidedBean() {
      assertThat(context.getEnvironment().getActiveProfiles())
          .containsExactlyInAnyOrder("test", "api");
      assertThat(context.getBeansOfType(GuidedSessionReaper.class)).isEmpty();
      assertThat(context.getBeansOfType(GuidedTranslationCoordinator.class)).isEmpty();
      // The API still serves the guided routes: the services the timers call are present.
      assertThat(context.getBeansOfType(GuidedSessionService.class)).hasSize(1);
    }
  }

  // ---- helpers ----

  private static Method coordinatorMethod() {
    return Arrays.stream(GuidedTranslationConfiguration.class.getDeclaredMethods())
        .filter(method -> method.getName().equals("guidedTranslationCoordinator"))
        .findFirst()
        .orElseThrow();
  }

  /** Stand-ins for everything {@code GuidedTranslationConfiguration} injects from elsewhere. */
  private static void collaborators(AnnotationConfigApplicationContext context) {
    context.registerBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class));
    context.registerBean(StudioRepository.class, () -> mock(StudioRepository.class));
    context.registerBean(GuidedContracts.class, GuidedContracts::new);
    context.registerBean(CredentialPatternScreen.class, () -> mock(CredentialPatternScreen.class));
    context.registerBean(GuidedSessionService.class, () -> mock(GuidedSessionService.class));
    context.registerBean(GuidedSessionRepository.class, () -> mock(GuidedSessionRepository.class));
    context.registerBean(GuidedDispatchService.class, () -> mock(GuidedDispatchService.class));
    context.registerBean(GuidedLlmGatewayClient.class, () -> mock(GuidedLlmGatewayClient.class));
    context.registerBean(StudioRunnerTls.class, StudioRunnerTls::unconfigured);
  }
}
