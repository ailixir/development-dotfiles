package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.compile.gateway.GatewayResponseParser;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

/**
 * Story 10.8 AC-8 and AC-6 — the two numbers this backend holds a second copy of.
 *
 * <p>Built on the {@code ArtifactSchemaDriftTest} pattern: one canonical value, a second copy, and
 * a test that fails the build the moment they disagree. Drift here does not produce a compile
 * error; it produces artifacts compiled against a reference the runner no longer implements, which
 * the runner then refuses at launch — in staging, under a code that names a version nobody changed
 * on purpose.
 */
class RunnerPinDriftTest {

  private static final Path RUNNER_VERSIONS = Path.of("..", "studio-runner", "src", "versions.ts");
  private static final Path RUNNER_BOUNDS =
      Path.of("..", "studio-runner", "src", "validator", "bounds.ts");
  private static final Path SYNTAX_REFERENCE =
      Path.of("src", "main", "resources", "studio", "syntax-reference.md");

  // ── AC-8 ──────────────────────────────────────────────────────────────────

  @Test
  void thePinnedSyntaxReferenceVersionEqualsTheRunnersOwn() throws IOException {
    String runnerValue = exportedString(RUNNER_VERSIONS, "SYNTAX_REFERENCE_VERSION");

    assertThat(CompilePins.SYNTAX_REFERENCE_VERSION)
        .as(
            "CompilePins.SYNTAX_REFERENCE_VERSION has drifted from %s — the backend would compile"
                + " against a reference corpus the runner does not implement",
            RUNNER_VERSIONS)
        .isEqualTo(runnerValue);
  }

  @Test
  void theSyntaxReferenceBodyDeclaresTheVersionItIsShippedAs() throws IOException {
    String body = Files.readString(SYNTAX_REFERENCE, StandardCharsets.UTF_8);

    assertThat(body)
        .as("the syntax reference body must declare its own version in a marker comment")
        .contains(CompilePins.VERSION_MARKER_PREFIX);
    assertThat(body)
        .as(
            "%s declares a version other than CompilePins.SYNTAX_REFERENCE_VERSION",
            SYNTAX_REFERENCE)
        .contains(
            CompilePins.VERSION_MARKER_PREFIX + CompilePins.SYNTAX_REFERENCE_VERSION + " -->");
  }

  @Test
  void thePinnedArtifactVersionEqualsTheRunnersArtifactVersion() throws IOException {
    String runnerValue = exportedNumber(RUNNER_VERSIONS, "ARTIFACT_VERSION");

    assertThat(String.valueOf(GatewayResponseParser.SUPPORTED_ARTIFACT_VERSION))
        .as("the backend and the runner disagree about the executable artifact envelope version")
        .isEqualTo(runnerValue);
  }

  // ── AC-6 ──────────────────────────────────────────────────────────────────

  @Test
  void theBackendStepCapIsNotLooserThanTheRunnersMaxSteps() throws IOException {
    int runnerMaxSteps = Integer.parseInt(boundsValue("maxSteps"));

    assertThat(defaultAuthoring().maxSteps())
        .as(
            "a backend step cap looser than the runner's %d would make a draft authorable and"
                + " structurally uncompilable — the bound would only fail after a gateway call had"
                + " already been paid for",
            runnerMaxSteps)
        .isLessThanOrEqualTo(runnerMaxSteps);
    assertThat(shippedDefault("authoring", "max-steps"))
        .as("the application.yml default must satisfy the same rule as the record default")
        .isLessThanOrEqualTo(runnerMaxSteps);
  }

  @Test
  void theDiagnosticsCapsAreAlignedWithTheRunnersOwn() throws IOException {
    StudioCompileProperties.Diagnostics diagnostics = defaults().diagnostics();

    assertThat(diagnostics.maxPerStep())
        .as("diagnostics per step must not exceed what the runner will ever send")
        .isLessThanOrEqualTo(Integer.parseInt(boundsValue("maxDiagnosticsPerStep")));
    assertThat(diagnostics.maxMessageChars())
        .isLessThanOrEqualTo(Integer.parseInt(boundsValue("maxDiagnosticMessageLength")));
    assertThat(diagnostics.maxExcerptChars())
        .isLessThanOrEqualTo(Integer.parseInt(boundsValue("maxExcerptLength")));
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /**
   * The bounds this backend actually ships, bound from the record's own {@code @DefaultValue}
   * declarations rather than restated here. A test that repeated the literals would pass forever
   * after someone changed the configuration and forgot the test.
   *
   * @return the shipped defaults
   */
  static StudioCompileProperties defaults() {
    return new Binder(new MapConfigurationPropertySource(Map.of()))
        .bindOrCreate("studio.compile", StudioCompileProperties.class);
  }

  static StudioCompileProperties.Authoring defaultAuthoring() {
    return defaults().authoring();
  }

  /**
   * The default baked into {@code application.yml} under a named block, which is what a deployment
   * gets when the environment variable is unset. Kept separate from the record default so a
   * divergence between the two is visible rather than averaged away.
   *
   * <p>The block is part of the lookup, not decoration. {@code max-steps} is declared twice in this
   * file — once here for authoring bounds and once by story 10.7a for the callback body cap — and a
   * search for the leaf name alone silently read the wrong one, comparing a 500-step callback cap
   * against the runner's authoring bound and failing for a drift that did not exist.
   *
   * @param block the parent key, e.g. {@code authoring}
   * @param key the leaf property name
   * @return the literal after the {@code :} in the placeholder
   */
  private static int shippedDefault(String block, String key) throws IOException {
    Path applicationYml = Path.of("src", "main", "resources", "application.yml");
    String source = Files.readString(applicationYml, StandardCharsets.UTF_8);
    int start = source.indexOf("\n    " + block + ":");
    assertThat(start).as("application.yml declares the %s block", block).isNotNegative();
    Matcher matcher =
        Pattern.compile(key + ":\\s*\\$\\{[A-Z_]+:(\\d+)}").matcher(source.substring(start));
    assertThat(matcher.find()).as("application.yml declares %s.%s", block, key).isTrue();
    return Integer.parseInt(matcher.group(1));
  }

  private static String exportedString(Path file, String name) throws IOException {
    return capture(file, "export const " + name + "\\s*=\\s*'([^']+)'");
  }

  private static String exportedNumber(Path file, String name) throws IOException {
    return capture(file, "export const " + name + "\\s*=\\s*(\\d+)");
  }

  private static String boundsValue(String key) throws IOException {
    String source = Files.readString(RUNNER_BOUNDS, StandardCharsets.UTF_8);
    int defaults = source.indexOf("DEFAULT_BOUNDS");
    assertThat(defaults).as("DEFAULT_BOUNDS is declared in %s", RUNNER_BOUNDS).isNotNegative();
    Matcher matcher =
        Pattern.compile(key + ":\\s*([0-9*\\s]+?),").matcher(source.substring(defaults));
    assertThat(matcher.find()).as("%s is declared in DEFAULT_BOUNDS", key).isTrue();
    String expression = matcher.group(1).replaceAll("\\s", "");
    int product = 1;
    for (String factor : expression.split("\\*")) {
      product *= Integer.parseInt(factor);
    }
    return String.valueOf(product);
  }

  private static String capture(Path file, String regex) throws IOException {
    assertThat(file).as("the runner source must be readable from the backend build").exists();
    Matcher matcher =
        Pattern.compile(regex).matcher(Files.readString(file, StandardCharsets.UTF_8));
    assertThat(matcher.find()).as("%s declares a value matching %s", file, regex).isTrue();
    return matcher.group(1);
  }
}
