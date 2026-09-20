package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Story 10.8 AC-3 — every compile-state transition goes through {@link CompileStateService}.
 *
 * <p>This scans the compile and readiness packages' SQL and JPA surface and fails on any statement
 * that targets a compile-state column outside that one class. The point is not style. 10.4's guards
 * are conditional {@code UPDATE ... WHERE} statements whose affected-row count is asserted; a
 * single JPA dirty write or ad-hoc {@code UPDATE} elsewhere would bypass the guard entirely and
 * nothing at runtime would notice — the row would simply have been written by someone who never
 * checked whether the draft had moved on.
 *
 * <p>A source scan is the right instrument because the failure mode is a <em>new</em> write site,
 * which no behavioural test can anticipate.
 */
class CompileStateSurfaceTest {

  /** The columns 10.4 owns. */
  private static final List<String> GUARDED_COLUMNS =
      List.of(
          "compile_status",
          "compile_request_id",
          "compile_error",
          "compile_diagnostics",
          "current_candidate_revision_id",
          "confirmed_revision_id");

  /** The JPA setters that would write them. */
  private static final List<String> GUARDED_SETTERS =
      List.of(
          "setCompileStatus(",
          "setCompileRequestId(",
          "setCompileError(",
          "setCompileDiagnostics(",
          "setCurrentCandidateRevisionId(",
          "setConfirmedRevisionId(");

  private static final Path COMPILE_PACKAGE =
      Path.of("src", "main", "java", "com", "citi", "put", "checks", "studio", "compile");
  private static final Path READINESS_PACKAGE =
      Path.of("src", "main", "java", "com", "citi", "put", "checks", "studio", "readiness");

  @Test
  void noClassInTheCompileOrReadinessPackagesWritesACompileStateColumn() throws IOException {
    List<Path> scanned = scanned();
    assertThat(scanned).as("the scan must actually cover the new code").isNotEmpty();

    for (Path file : scanned) {
      String source = Files.readString(file, StandardCharsets.UTF_8);
      String withoutComments = stripCommentsAndJavadoc(source);

      for (String column : GUARDED_COLUMNS) {
        assertThat(writesColumn(withoutComments, column))
            .as(
                "%s contains SQL that writes %s — every transition must go through"
                    + " CompileStateService",
                file, column)
            .isFalse();
      }
      for (String setter : GUARDED_SETTERS) {
        assertThat(withoutComments)
            .as("%s calls %s — that is a JPA dirty write around the state machine", file, setter)
            .doesNotContain(setter);
      }
    }
  }

  @Test
  void theReadinessGateReadsNoCompileStateColumnAtAll() {
    String query =
        com.citi.put.checks.studio.readiness.ExecutionReadinessService.READINESS_QUERY.toLowerCase(
            java.util.Locale.ROOT);

    for (String column :
        List.of(
            "compile_status",
            "compile_request_id",
            "compile_error",
            "compile_diagnostics",
            "current_candidate_revision_id")) {
      assertThat(query)
          .as(
              "the readiness predicate selects %s; AC-22 states the predicate exactly and %s is"
                  + " not one of its terms",
              column, column)
          .doesNotContain(column);
    }
    assertThat(query)
        .as("confirmed_revision_id IS a term — term 2 — and must be read")
        .contains("confirmed_revision_id");
  }

  /**
   * A write is an {@code UPDATE}/{@code INSERT} naming the column, or a {@code SET column =}. A
   * conditional {@code WHERE column = ?} is a read and is permitted: the pipeline's publish calls
   * pass the request identity <em>into</em> {@link CompileStateService}, which is the point.
   */
  private static boolean writesColumn(String source, String column) {
    String normalized = source.toLowerCase(java.util.Locale.ROOT).replaceAll("\\s+", " ");
    return normalized.contains("set " + column + " =")
        || normalized.contains("," + column + " =")
        || normalized.contains("update ui_tests set")
        || normalized.contains("insert into ui_tests");
  }

  private static String stripCommentsAndJavadoc(String source) {
    return source.replaceAll("(?s)/\\*.*?\\*/", " ").replaceAll("(?m)^\\s*//.*$", " ");
  }

  private static List<Path> scanned() throws IOException {
    try (Stream<Path> compile = Files.walk(COMPILE_PACKAGE);
        Stream<Path> readiness = Files.walk(READINESS_PACKAGE)) {
      return Stream.concat(compile, readiness)
          .filter(path -> path.toString().endsWith(".java"))
          .filter(path -> !path.getFileName().toString().equals("CompileStateService.java"))
          .toList();
    }
  }
}
