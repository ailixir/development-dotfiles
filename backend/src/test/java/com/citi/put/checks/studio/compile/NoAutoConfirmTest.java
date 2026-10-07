package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Confirmation writers — <b>exactly two exist: the manual {@code confirm} and the Run
 * auto-accept</b> (ADR-002 §35.5 item 3, story 10.49 AC-15).
 *
 * <p>This class was written for story 10.9 AC-21 ("no production auto-confirmation exists"). That
 * criterion is <b>superseded</b> by ADR-002 §35: Run is the confirming act (DEC-OQ3, C0-A3), and a
 * V1 Run compile is accepted inside its own publication transaction when, and only when, its
 * request's server-captured {@code trigger} is {@code RUN} and the confirmer is the request's
 * {@code created_by}. The earlier version skipped {@code CompileStateService} — where that
 * auto-accept lives as inline SQL — and its statement check was satisfied by either writer, so it
 * was green while the property it named was false (§35.1 item 6). The scan below includes {@code
 * CompileStateService} and tells the two statements apart by the {@code confirmation_source} each
 * writes.
 *
 * <p>The properties stay scans rather than behavioural tests, deliberately: a behavioural test
 * shows what happened on the paths it exercised, and the failure mode here is a <em>new</em> writer
 * no behavioural test anticipates. The conditions under which the Run writer fires are proven
 * behaviourally in {@code RunConfirmationTest}.
 */
class NoAutoConfirmTest {

  private static final Path MAIN = Path.of("src", "main", "java");
  private static final Path TEST = Path.of("src", "test", "java");

  /**
   * A call to {@code confirm(...)} on any receiver — never the declaration, never a longer name.
   */
  private static final Pattern CONFIRM_CALL = Pattern.compile("\\.\\s*confirm\\s*\\(");

  /**
   * A write of the confirmation identity: SQL {@code SET confirmed_by =}, {@code , confirmed_by =}
   * in a multi-column {@code SET}, an {@code INSERT INTO ui_test_revisions} column list naming
   * {@code confirmed_by}, or a JPA {@code setConfirmedBy(}. Case-insensitive.
   */
  private static final Pattern CONFIRMATION_WRITE =
      Pattern.compile(
          "(?i)(\\bset\\s+confirmed_by\\s*=|,\\s*confirmed_by\\s*=|setconfirmedby\\s*\\("
              + "|insert\\s+into\\s+ui_test_revisions\\s*\\([^)]*\\bconfirmed_by\\b)");

  private static final String MANUAL_WRITER =
      "SET confirmed_by = ?, confirmed_at = NOW(), confirmation_source = 'MANUAL'";
  private static final String RUN_WRITER =
      "SET confirmed_by = ?, confirmed_at = NOW(), confirmation_source = 'RUN'";

  private static final Path APPLICATION_YML =
      Path.of("src", "main", "resources", "application.yml");
  private static final Path STATE_SERVICE =
      MAIN.resolve(
          Path.of("com", "citi", "put", "checks", "studio", "compile", "CompileStateService.java"));
  private static final Path STUDIO_SERVICE =
      MAIN.resolve(Path.of("com", "citi", "put", "checks", "studio", "StudioService.java"));

  /**
   * The detector this file's scan depends on, exercised before it is trusted.
   *
   * <p>QA found the earlier version of that scan to be vacuous, and the shape of the defect is
   * worth naming because it is subtle: the scan matched the <em>receiver's variable name</em>
   * ({@code compileStateService.confirm(} / {@code states.confirm(}) while its non-vacuity guard
   * pinned only the <em>method's</em> spelling ({@code public UUID confirm(}). The guard protecting
   * the guard therefore checked a different thing than the guard, and a production component
   * calling {@code stateService.confirm(…, "system")} — an auto-confirmation with no principal —
   * left the test green.
   *
   * <p>So the detector is now receiver-agnostic, and the control below is the receiver name QA
   * actually used plus three more. A detector that stopped matching would fail here rather than
   * reporting a clean codebase.
   */
  @Test
  void theConfirmCallDetectorMatchesAnyReceiverSoAnAbsenceIsAnAbsence() {
    for (String receiver :
        List.of(
            "stateService",
            "compileStateService",
            "states",
            "this.compileStateService",
            "beans.get(CompileStateService.class)")) {
      assertThat(callsConfirm(receiver + ".confirm(testId, revisionId, hash, 1L, 1L, \"system\");"))
          .as("the detector must match a confirm() call on receiver %s", receiver)
          .isTrue();
    }
    assertThat(callsConfirm("studioService.confirmCompile(id, request, auth);"))
        .as("and must not fire on confirmCompile, which is the route's own service method")
        .isFalse();
    assertThat(callsConfirm("test.setConfirmedRevisionId(id);"))
        .as("nor on an unrelated identifier that merely contains the word")
        .isFalse();
  }

  /** The writer detector, exercised before it is trusted: an absence below is an absence. */
  @Test
  void theConfirmationWriterDetectorMatchesEveryWriteShape() {
    for (String write :
        List.of(
            "UPDATE ui_test_revisions SET confirmed_by = ?, confirmed_at = NOW()",
            "update ui_test_revisions set confirmed_by='system'",
            "UPDATE ui_test_revisions SET confirmed_at = NOW(), confirmed_by = ?",
            "revision.setConfirmedBy(principal);",
            "INSERT INTO ui_test_revisions (id, test_id, confirmed_by, confirmed_at) VALUES")) {
      assertThat(confirmationWrites(write)).as("must detect %s", write).isEqualTo(1);
    }
    assertThat(confirmationWrites("WHERE confirmed_by IS NULL AND confirmed_at IS NULL"))
        .as("a predicate on the column is not a write")
        .isZero();
    assertThat(confirmationWrites("SELECT confirmed_by FROM ui_test_revisions")).isZero();
  }

  /**
   * ADR-002 §35.5 item 3: exactly two confirmation writers exist in production code — the manual
   * {@code confirm} ({@code MANUAL}) and the Run auto-accept ({@code RUN}) — and both are in {@code
   * CompileStateService}, which this scan does <b>not</b> skip.
   */
  @Test
  void exactlyTwoConfirmationWritersExistTheManualConfirmAndTheRunAutoAccept() throws IOException {
    List<String> writers = new ArrayList<>();
    for (Path file : javaFiles(MAIN)) {
      String source = stripComments(Files.readString(file, StandardCharsets.UTF_8));
      int count = confirmationWrites(source);
      for (int i = 0; i < count; i++) {
        writers.add(file.getFileName().toString());
      }
    }
    assertThat(writers)
        .as(
            "confirmed_by is written only by the manual confirm and the Run auto-accept; a third"
                + " writer is an unreviewed confirmation path (ADR-002 §35)")
        .containsExactly("CompileStateService.java", "CompileStateService.java");

    String service = stripComments(Files.readString(STATE_SERVICE, StandardCharsets.UTF_8));
    assertThat(occurrences(service, MANUAL_WRITER)).as("one MANUAL writer").isEqualTo(1);
    assertThat(occurrences(service, RUN_WRITER)).as("one RUN writer").isEqualTo(1);
    assertThat(methodBody(service, "public UUID confirm("))
        .as("the MANUAL writer is the manual confirm transition")
        .contains(MANUAL_WRITER)
        .doesNotContain(RUN_WRITER);
    String publish = methodBody(service, "private PublishResult publish(");
    assertThat(publish)
        .as("the RUN writer is the Run auto-accept inside the publication transaction")
        .contains(RUN_WRITER)
        .doesNotContain(MANUAL_WRITER);
    assertThat(publish.substring(0, publish.indexOf(RUN_WRITER)))
        .as("and it is reached only through the C0-A3 condition")
        .contains("boolean runAccepts = runRequested && runConfirms(")
        .contains("if (runAccepts)");
  }

  /**
   * The confirmation transition has exactly one caller in production code, and it is the route's
   * service method.
   *
   * <p>The scan is <b>receiver-agnostic</b> — any {@code .confirm(} in a production file that
   * references {@code CompileStateService} is a caller, whatever the field is named. Scoping to
   * files that name the type keeps an unrelated {@code confirm(} elsewhere in the codebase from
   * becoming a false failure, and it closes nothing: a component cannot be injected with the
   * service without naming its type.
   *
   * <p>Two non-vacuity guards, and they now check the same thing the scan does: the detector is
   * exercised in {@link #theConfirmCallDetectorMatchesAnyReceiverSoAnAbsenceIsAnAbsence()}, and the
   * expectation here is {@code hasSize(1)} rather than {@code isEmpty()} — a detector that matched
   * nothing would fail rather than report a clean codebase.
   */
  @Test
  void theConfirmTransitionHasExactlyOneProductionCaller() throws IOException {
    assertThat(Files.readString(STATE_SERVICE, StandardCharsets.UTF_8))
        .as("the transition exists and is spelled this way")
        .contains("public UUID confirm(");

    List<Path> scanned = new ArrayList<>();
    List<Path> callers = new ArrayList<>();
    for (Path file : javaFiles(MAIN)) {
      if (file.equals(STATE_SERVICE)) {
        continue;
      }
      String source = stripComments(Files.readString(file, StandardCharsets.UTF_8));
      if (!source.contains("CompileStateService")) {
        continue;
      }
      scanned.add(file);
      if (callsConfirm(source)) {
        callers.add(file);
      }
    }

    assertThat(scanned)
        .as("the scan must actually cover the production classes that hold the service")
        .isNotEmpty()
        .anyMatch(path -> path.getFileName().toString().equals("CompilePipeline.java"))
        .anyMatch(path -> path.getFileName().toString().equals("StudioService.java"));
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
        .as("and the manual statement binds it rather than writing a literal")
        .contains(MANUAL_WRITER);
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

  /**
   * Whether a source body calls {@code confirm(...)} on <em>any</em> receiver.
   *
   * <p>{@code \\b} before {@code confirm} is what keeps {@code setConfirmedRevisionId} and {@code
   * confirmCompile} out: the first has no {@code (} directly after {@code confirm}, and the second
   * continues the identifier. The dot is required, so a declaration of {@code confirm(} is not a
   * call to it.
   *
   * @param source comment-stripped Java source
   * @return true when the body invokes the transition
   */
  private static boolean callsConfirm(String source) {
    return CONFIRM_CALL.matcher(source).find();
  }

  private static int confirmationWrites(String source) {
    return (int) CONFIRMATION_WRITE.matcher(source).results().count();
  }

  private static int occurrences(String source, String needle) {
    int count = 0;
    for (int at = source.indexOf(needle); at >= 0; at = source.indexOf(needle, at + 1)) {
      count++;
    }
    return count;
  }

  /** The text of the method whose declaration starts with {@code signature}, braces balanced. */
  private static String methodBody(String source, String signature) {
    int start = source.indexOf(signature);
    assertThat(start).as("method %s exists", signature).isGreaterThan(-1);
    int open = source.indexOf('{', start);
    int depth = 0;
    for (int i = open; i < source.length(); i++) {
      char c = source.charAt(i);
      if (c == '{') {
        depth++;
      } else if (c == '}' && --depth == 0) {
        return source.substring(start, i + 1);
      }
    }
    throw new AssertionError("unbalanced braces after " + signature);
  }

  private static String stripComments(String source) {
    return source.replaceAll("(?s)/\\*.*?\\*/", " ").replaceAll("(?m)^\\s*//.*$", " ");
  }
}
