package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Story 10.9 AC-21 — <b>no production auto-confirmation and no temporary gate bypass exists.</b>
 *
 * <p>Epic 10's release ordering is explicit: "No temporary gate bypass or production
 * auto-confirmation is allowed", and §10.8's third acceptance bullet says "no production
 * auto-confirm fallback exists". Story 10.8 AC-26 closed the readiness half; this closes the
 * confirmation half.
 *
 * <p>Two properties, and both are scans rather than behavioural tests, deliberately. A behavioural
 * test can show that no auto-confirmation happened on the paths it exercised; the criterion is that
 * no such path <em>exists</em>, and the failure mode is a <em>new</em> one that no behavioural test
 * can anticipate.
 */
class NoAutoConfirmTest {

  private static final Path MAIN = Path.of("src", "main", "java");
  private static final Path TEST = Path.of("src", "test", "java");
  private static final Path APPLICATION_YML =
      Path.of("src", "main", "resources", "application.yml");
  private static final Path STATE_SERVICE =
      MAIN.resolve(
          Path.of("com", "citi", "put", "checks", "studio", "compile", "CompileStateService.java"));
  private static final Path STUDIO_SERVICE =
      MAIN.resolve(Path.of("com", "citi", "put", "checks", "studio", "StudioService.java"));

  /**
   * The confirmation transition has exactly one caller in production code, and it is the route's
   * service method.
   *
   * <p>Non-vacuity is asserted first: the transition really is spelled {@code confirm(} and really
   * is called from somewhere, so an empty result below would be a finding and not a typo.
   */
  @Test
  void theConfirmTransitionHasExactlyOneProductionCaller() throws IOException {
    assertThat(Files.readString(STATE_SERVICE, StandardCharsets.UTF_8))
        .as("the transition exists and is spelled this way")
        .contains("public UUID confirm(");

    List<Path> callers = new ArrayList<>();
    for (Path file : javaFiles(MAIN)) {
      if (file.equals(STATE_SERVICE)) {
        continue;
      }
      String source = stripComments(Files.readString(file, StandardCharsets.UTF_8));
      if (source.contains("compileStateService.confirm(") || source.contains("states.confirm(")) {
        callers.add(file);
      }
    }

    assertThat(callers)
        .as(
            "confirmation must happen only through an authenticated principal's explicit call to"
                + " POST /tests/{id}/confirm-compile; any other caller is an auto-confirm path")
        .hasSize(1);
    assertThat(callers.get(0).getFileName().toString()).isEqualTo("StudioService.java");
  }

  /**
   * No scheduler, runner or event listener in production code can reach the confirmation.
   *
   * <p>The single caller above is a request-scoped service method, so this asserts the one thing
   * that would make it reachable without a request: that the class holding it carries no scheduling
   * or startup-callback annotation.
   */
  @Test
  void noScheduledOrStartupComponentCanReachTheConfirmation() throws IOException {
    String service = Files.readString(STUDIO_SERVICE, StandardCharsets.UTF_8);

    assertThat(stripComments(service))
        .as("StudioService must not schedule anything or run at startup")
        .doesNotContain("@Scheduled")
        .doesNotContain("CommandLineRunner")
        .doesNotContain("ApplicationRunner")
        .doesNotContain("@EventListener")
        .doesNotContain("@PostConstruct");
  }

  /**
   * {@code confirmed_by} is always the authenticated principal — never a constant, a placeholder, a
   * service identity or null.
   *
   * <p>The statement takes the principal as a bound parameter and the only production caller passes
   * {@code principalOf(auth)}. Both halves are asserted, because either one alone would permit the
   * other to be wrong.
   */
  @Test
  void theConfirmerIsAlwaysTheAuthenticatedPrincipal() throws IOException {
    String service = stripComments(Files.readString(STUDIO_SERVICE, StandardCharsets.UTF_8));

    int call = service.indexOf("compileStateService.confirm(");
    assertThat(call).as("the single caller exists").isGreaterThan(-1);
    String arguments = service.substring(call, service.indexOf(");", call));

    assertThat(arguments)
        .as("the principal is derived from the authentication, not supplied as a value")
        .contains("principalOf(auth)");
    for (String forbidden :
        List.of("\"system\"", "\"service\"", "\"studio\"", "SERVICE_IDENTITY", "null)")) {
      assertThat(arguments)
          .as("confirmed_by must never be %s", forbidden)
          .doesNotContain(forbidden);
    }

    assertThat(stripComments(Files.readString(STATE_SERVICE, StandardCharsets.UTF_8)))
        .as("and the statement binds it rather than writing a literal")
        .contains("SET confirmed_by = ?, confirmed_at = NOW()");
  }

  /**
   * The configuration surface carries no key that could confirm a candidate or skip the route.
   *
   * <p>Enumerated from {@code application.yml} rather than asserted in prose, and guarded against
   * vacuity: the scan must find the {@code studio.compile} keys it is supposed to be reading, so a
   * mistyped path cannot pass as "no dangerous keys".
   */
  @Test
  void noConfigurationKeyCanAutoConfirmOrSkipTheConfirmationRoute() throws IOException {
    String configuration =
        Files.readString(APPLICATION_YML, StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);

    assertThat(configuration)
        .as("the scan really read the Studio compile configuration block")
        .contains("attempt-budget")
        .contains("max-attempts")
        .contains("threshold");

    for (String dangerous :
        List.of(
            "auto-confirm",
            "autoconfirm",
            "auto_confirm",
            "skip-confirm",
            "skip-confirmation",
            "confirm-bypass",
            "bypass-confirm",
            "assume-confirmed",
            "force-ready",
            "skip-readiness",
            "readiness-bypass")) {
      assertThat(configuration)
          .as("application.yml declares %s; no key may confirm a candidate", dangerous)
          .doesNotContain(dangerous);
    }
  }

  /**
   * Every seeding helper capable of producing a confirmed revision is test-scoped and drives the
   * <b>real</b> transition.
   *
   * <p>10.8's {@code ReadinessFixtures} already did this, and the risk this story carries is
   * regressing it by adding a faster path — a fixture that hand-wrote {@code confirmed_by} would
   * make every downstream test prove only that the gate accepts hand-written rows.
   *
   * <p>The exemptions are named rather than pattern-matched. Both are <b>migration</b> tests that
   * seed a confirmed revision with raw SQL against a Testcontainers database held at an earlier
   * schema version, where no application code exists to drive a transition with: 10.4's {@code
   * RevisionMigrationIT} and this story's {@code CompileStartedAtMigrationIT}. Neither is a fixture
   * any other test consumes. A third name appearing in this list is the finding.
   */
  @Test
  void everySeedingHelperIsTestScopedAndDrivesTheRealTransition() throws IOException {
    for (String fixture : List.of("ReadinessFixtures.java", "ConfirmFixtures.java")) {
      Path path = find(TEST, fixture);
      assertThat(path).as("%s is test-scoped", fixture).isNotNull();
      String source = Files.readString(path, StandardCharsets.UTF_8);
      assertThat(source)
          .as("%s must drive the real transitions rather than writing rows", fixture)
          .contains("states.beginCompile(")
          .contains("states.publishCandidate(");
    }
    assertThat(Files.readString(find(TEST, "ReadinessFixtures.java"), StandardCharsets.UTF_8))
        .as("ReadinessFixtures confirms through CompileStateService, as 10.8 wrote it")
        .contains("states.confirm(");

    // And no production class writes the confirmation columns at all.
    for (Path file : javaFiles(MAIN)) {
      if (file.equals(STATE_SERVICE)) {
        continue;
      }
      String source = stripComments(Files.readString(file, StandardCharsets.UTF_8));
      assertThat(source.toLowerCase(Locale.ROOT))
          .as("%s writes a confirmation identity outside CompileStateService", file)
          .doesNotContain("set confirmed_by")
          .doesNotContain("setconfirmedby(");
    }

    // The only test that writes one directly is the migration IT, named here so the exemption is
    // deliberate rather than the accidental result of a pattern that happened not to match.
    List<Path> directWriters = new ArrayList<>();
    for (Path file : javaFiles(TEST)) {
      // This scanner names the pattern it looks for and would otherwise match itself.
      if (file.getFileName().toString().equals("NoAutoConfirmTest.java")) {
        continue;
      }
      String source = Files.readString(file, StandardCharsets.UTF_8);
      if (source.contains("confirmed_by, confirmed_at) VALUES")
          || source.contains("SET confirmed_by =")) {
        directWriters.add(file.getFileName());
      }
    }
    assertThat(directWriters.stream().map(Path::toString).toList())
        .as("a new fixture that hand-writes a confirmation identity must be justified here")
        .containsExactlyInAnyOrder("RevisionMigrationIT.java", "CompileStartedAtMigrationIT.java");
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private static Path find(Path root, String fileName) throws IOException {
    try (Stream<Path> files = Files.walk(root)) {
      return files
          .filter(path -> path.getFileName().toString().equals(fileName))
          .findFirst()
          .orElse(null);
    }
  }

  private static List<Path> javaFiles(Path root) throws IOException {
    try (Stream<Path> files = Files.walk(root)) {
      return files.filter(path -> path.toString().endsWith(".java")).toList();
    }
  }

  private static String stripComments(String source) {
    return source.replaceAll("(?s)/\\*.*?\\*/", " ").replaceAll("(?m)^\\s*//.*$", " ");
  }
}
