package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * Story 10.9 AC-15a — <b>syntax validity is not asserted as semantic correctness, anywhere on this
 * surface.</b>
 *
 * <p>Architecture §4.1 and §4.5 both say it in their own words: static validation "cannot prove the
 * locator matches the application or the assertion captures the user's intent", and the restriction
 * "limits executable capabilities, not semantic mistakes". Repair changes nothing about this. An
 * artifact that took three attempts is neither more nor less trustworthy than one that took one,
 * and the author reviews and confirms it identically.
 *
 * <p>Scanned in the same shape as 10.8 AC-7's honesty assertion about credential patterns, and
 * extended by ADR-002 §16.9 item 6 to the new field descriptions: the compile package's sources and
 * README, the confirmation surface on {@code StudioService} and {@code StudioController}, the four
 * diagnostics DTOs, and the frozen contract's own descriptions for the confirm operation and the
 * five schemas this story fills in.
 */
class SemanticHonestyTest {

  private static final Path CONTRACT = Path.of("..", "docs", "specs", "studio", "openapi.yaml");
  private static final Path STUDIO =
      Path.of("src", "main", "java", "com", "citi", "put", "checks", "studio");

  /**
   * Claims no string on this surface may make.
   *
   * <p>Each is a statement that a validated or repaired artifact does what its author meant — which
   * is the one thing the compiler, the validator and the repair loop together cannot establish.
   */
  private static final List<String> FORBIDDEN_CLAIMS =
      List.of(
          "semantically correct",
          "semantically valid",
          "does what you meant",
          "does what the user meant",
          "is correct and will pass",
          "verified to work",
          "guaranteed to work",
          "guarantees the test works",
          "proves the test does",
          "proves the locator matches",
          "confirms the assertion captures",
          "correctly implements your intent",
          "a repaired artifact is more reliable",
          "repair makes the artifact correct");

  /**
   * The matcher itself is exercised before it is trusted.
   *
   * <p>A scan whose needle never matches anything is indistinguishable from a surface that is
   * clean. This plants each forbidden claim in a control string and asserts the same detector that
   * scans the real files finds it.
   */
  @Test
  void theDetectorFindsAPlantedClaimSoAnAbsenceIsAnAbsence() {
    for (String claim : FORBIDDEN_CLAIMS) {
      String control = "This compiled step " + claim + " once the author confirms it.";
      assertThat(claimsFoundIn(control))
          .as("the detector must find the planted claim \"%s\"", claim)
          .containsExactly(claim);
    }
    assertThat(claimsFoundIn("Static validation cannot prove the locator matches the application."))
        .as("and must not fire on the architecture's own honest wording")
        .isEmpty();
  }

  @Test
  void noJavaStringOnTheCompileRepairOrConfirmationSurfaceClaimsSemanticCorrectness()
      throws IOException {
    List<Path> files = surfaceFiles();
    assertThat(files).as("the scan must actually cover the surface").isNotEmpty();
    assertThat(files)
        .as("including the classes this story added")
        .anyMatch(path -> path.getFileName().toString().equals("RepairPromptAssembler.java"))
        .anyMatch(path -> path.getFileName().toString().equals("CompileDiagnosticsDto.java"))
        .anyMatch(path -> path.getFileName().toString().equals("ConfirmCompileRequestDto.java"));

    for (Path file : files) {
      String text = Files.readString(file, StandardCharsets.UTF_8);
      assertThat(claimsFoundIn(text))
          .as("%s states or implies that a validated step does what its author meant", file)
          .isEmpty();
    }
  }

  @Test
  void theCompileReadmeClaimsNoSemanticCorrectnessEither() throws IOException {
    Path readme = STUDIO.resolve(Path.of("compile", "README.md"));
    String text = Files.readString(readme, StandardCharsets.UTF_8);

    assertThat(claimsFoundIn(text)).as("%s", readme).isEmpty();
    assertThat(text.toLowerCase(Locale.ROOT))
        .as("and it says the opposite, in the architecture's own terms")
        .contains("not a proof");
  }

  /**
   * ADR-002 §16.9 item 6 — the honesty assertion extends to the new field descriptions.
   *
   * <p>The whole document is scanned rather than the five schemas alone: a claim about semantic
   * correctness is no more acceptable on a neighbouring operation's description than on these, and
   * scanning everything removes the judgement call about what counts as "this surface".
   */
  @Test
  void noDescriptionInTheFrozenContractClaimsSemanticCorrectness() throws IOException {
    String contract = Files.readString(CONTRACT, StandardCharsets.UTF_8);
    assertThat(claimsFoundIn(contract)).as("docs/specs/studio/openapi.yaml").isEmpty();

    // Non-vacuity: the descriptions this story fills in really are in the text being scanned, and
    // they really do state the limitation rather than merely omit the claim.
    assertThat(contract)
        .contains("Nothing here asserts that a step the validator accepted does what its author")
        .contains("cannot prove the locator matches the application");
  }

  /** The five schemas this story fills in are declared, so the scan above has a subject. */
  @Test
  @SuppressWarnings("unchecked")
  void theSchemasThisStoryFillsInAreDeclared() throws IOException {
    Map<String, Object> contract =
        (Map<String, Object>) new Yaml().load(Files.readString(CONTRACT, StandardCharsets.UTF_8));
    Map<String, Object> schemas =
        (Map<String, Object>) ((Map<String, Object>) contract.get("components")).get("schemas");

    assertThat(schemas)
        .containsKeys(
            "TestDto",
            "CompileError",
            "CompileDiagnostic",
            "CompileStepDiagnostics",
            "CompileDiagnostics",
            "ConfirmCompileRequest");
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private static List<String> claimsFoundIn(String text) {
    String normalized = text.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    List<String> found = new ArrayList<>();
    for (String claim : FORBIDDEN_CLAIMS) {
      if (normalized.contains(claim)) {
        found.add(claim);
      }
    }
    return found;
  }

  /** The compile package, the four diagnostics DTOs and the confirmation surface. */
  private static List<Path> surfaceFiles() throws IOException {
    List<Path> files = new ArrayList<>();
    try (Stream<Path> compile = Files.walk(STUDIO.resolve("compile"))) {
      compile.filter(path -> path.toString().endsWith(".java")).forEach(files::add);
    }
    for (String name :
        List.of(
            "CompileErrorDto.java",
            "CompileDiagnosticDto.java",
            "CompileStepDiagnosticsDto.java",
            "CompileDiagnosticsDto.java",
            "ConfirmCompileRequestDto.java",
            "UITestDto.java")) {
      files.add(STUDIO.resolve(Path.of("dto", name)));
    }
    files.add(STUDIO.resolve("StudioService.java"));
    files.add(STUDIO.resolve("StudioController.java"));
    return files;
  }
}
