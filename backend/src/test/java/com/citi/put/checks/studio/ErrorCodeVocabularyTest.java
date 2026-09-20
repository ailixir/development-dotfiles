package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.Yaml;

/**
 * Story 10.14 AC-17 — the migration's value list is <b>read</b>, never transcribed.
 *
 * <p>ADR-002 §18.2 says the constraint is <i>"widened in lockstep with the enum whenever §15's
 * vocabulary grows"</i>, and §18.3 says to <i>"install the document-reading assertion once … Two
 * hand-maintained copies of one vocabulary in two languages is the arrangement that produced
 * INT-4"</i>. So all three of this test's inputs are read from the artefact that holds them:
 *
 * <ul>
 *   <li>the SQL — parsed out of {@code V20__studio_execution_cancel.sql}'s {@code CHECK … IN (…)},
 *       the migration that last defines the constraint (Studio v1 WP4 replaced V17's list with a
 *       superset; V17 stays as history and is read by {@code ErrorCodeConstraintMigrationIT});
 *   <li>the API's own vocabulary — {@link ExecutionErrorCode#values()}, which exists so a
 *       disjointness test <i>"reads this enumeration rather than a hardcoded copy of it that
 *       drifts"</i>;
 *   <li>the frozen contract — {@code components.schemas.ExecutionErrorCode.enum} in {@code
 *       docs/specs/studio/openapi.yaml}, the document {@link
 *       ExecutionErrorCodeContractEscalationTest} already parses.
 * </ul>
 *
 * <p><b>There is deliberately no list of codes in this file.</b> A hardcoded one would be a third
 * copy of the vocabulary, would pass, and would drift silently the next time §15 widens — which is
 * the exact failure O-11 exists because of. The only literals here are the shape of the SQL and the
 * path of the document.
 */
class ErrorCodeVocabularyTest {

  private static final Path CONTRACT = Path.of("..", "docs", "specs", "studio", "openapi.yaml");
  private static final Path MIGRATION =
      Path.of("src", "main", "resources", "db", "migration", "V20__studio_execution_cancel.sql");

  /** The statement under test: the {@code CHECK} clause, not the comment that explains it. */
  private static final Pattern CHECK_CLAUSE =
      Pattern.compile(
          "ADD CONSTRAINT\\s+ck_ui_test_executions_error_code\\s+CHECK\\s*\\("
              + "\\s*error_code IS NULL\\s+OR error_code IN\\s*\\((?<values>[^)]*)\\)",
          Pattern.CASE_INSENSITIVE);

  private static final Pattern QUOTED = Pattern.compile("'([^']+)'");

  private static Map<String, Object> contract;

  @BeforeAll
  @SuppressWarnings("unchecked")
  static void loadContract() throws IOException {
    contract =
        (Map<String, Object>) new Yaml().load(Files.readString(CONTRACT, StandardCharsets.UTF_8));
  }

  @Test
  void theMigrationConstrainsExactlyTheVocabularyTheApiCanAssign() {
    assertThat(migrationValues())
        .as(
            "the CHECK and dto/ExecutionErrorCode are one vocabulary. If this is red, one of them "
                + "was widened without the other — which is the drift O-11 exists because of, not "
                + "a test to relax")
        .isEqualTo(new TreeSet<>(ExecutionErrorCode.values()));
  }

  @Test
  void theMigrationConstrainsExactlyTheVocabularyTheFrozenContractDeclares() {
    assertThat(migrationValues())
        .as(
            "components.schemas.ExecutionErrorCode is the published surface; a value the database "
                + "accepts and the contract does not declare is a body the API would serve and its "
                + "own document would reject")
        .isEqualTo(contractEnum());
  }

  @Test
  void theNullMemberOfTheContractEnumIsCarriedByTheIsNullDisjunctAndNotByTheList() {
    String sql = migrationText();

    assertThat(sql)
        .as("a nullable column with an IN list and no IS NULL disjunct rejects every null row")
        .containsIgnoringCase("error_code IS NULL");
    assertThat(migrationValues())
        .as("`null` is a member of the contract enum and must not be spelled as a string value")
        .doesNotContain("null", "NULL");
  }

  /**
   * The form ADR-002 §18.2 fixes, and the one verified to work on the IT tier's PostgreSQL 15.
   *
   * <p>{@code ui_test_executions} is range-partitioned, so a plain {@code ADD CONSTRAINT} would
   * scan every partition under an {@code ACCESS EXCLUSIVE} lock. This is not a style assertion: it
   * is the difference between a deploy and an outage.
   *
   * <p><b>Read on the executable statements, never on the file.</b> QA found the original version
   * of this test satisfied by the migration's own documentation: the operator-remedy comment quotes
   * the DDL verbatim — {@code ALTER TABLE ui_test_executions VALIDATE CONSTRAINT
   * ck_ui_test_executions_error_code;} — so a grep over the whole text matched the comment and
   * stayed green with both statements deleted. A scan over an artefact that quotes itself is a scan
   * of its own prose. {@link #executableSql()} strips every {@code --} comment first, and the
   * control below asserts the stripping really removed the quoted copy.
   */
  @Test
  void theConstraintIsAddedNotValidAndValidatedSeparately() {
    String sql = executableSql();

    assertThat(sql)
        .as("the ADD is present as a statement, not as prose")
        .containsIgnoringCase("ALTER TABLE ui_test_executions")
        .containsIgnoringCase("ADD CONSTRAINT ck_ui_test_executions_error_code")
        .containsIgnoringCase("NOT VALID");
    assertThat(sql)
        .as("and so is the separate VALIDATE — a constraint left NOT VALID is half-applied")
        .containsIgnoringCase(
            "ALTER TABLE ui_test_executions VALIDATE CONSTRAINT ck_ui_test_executions_error_code");

    String upper = sql.toUpperCase(Locale.ROOT);
    assertThat(upper.indexOf("NOT VALID"))
        .as("VALIDATE must come after the NOT VALID add, not before it")
        .isLessThan(upper.indexOf("VALIDATE CONSTRAINT"));
    // Exactly one of each: a second VALIDATE, or a second ADD, is a migration nobody reasons about.
    assertThat(upper.split("NOT VALID", -1)).hasSize(2);
    assertThat(upper.split("VALIDATE CONSTRAINT", -1)).hasSize(2);
  }

  /**
   * The control for the stripping, and for the whole file's scanning discipline.
   *
   * <p>Two halves, and both are needed. The <b>trap really exists</b>: the raw file contains a
   * second, verbatim copy of the {@code VALIDATE} statement inside the operator remedy, so a naive
   * grep has something to find even with the DDL gone. And the <b>stripping really removes it</b>:
   * the executable text carries exactly one copy and none of the prose around it.
   */
  @Test
  void theCommentQuotesTheDdlVerbatimAndTheStrippedTextDoesNotCarryThatCopy() {
    String raw = migrationText();
    String executable = executableSql();
    String statement =
        "ALTER TABLE ui_test_executions VALIDATE CONSTRAINT" + " ck_ui_test_executions_error_code";

    // The trap: two copies in the file, one of them a comment.
    assertThat(raw.split(statement, -1))
        .as("the operator remedy quotes the DDL verbatim; that is what made the old scan vacuous")
        .hasSize(3);
    // Stripped: one copy, and it is the statement.
    assertThat(executable.split(statement, -1)).hasSize(2);

    // Nothing that is only ever prose survives the stripping.
    assertThat(raw).contains("the operator remedy");
    assertThat(executable)
        .doesNotContain("the operator remedy")
        .doesNotContain("PostgreSQL names the")
        .doesNotContain("SELECT id, started_at, error_code")
        .doesNotContain("--");

    // And what does survive is only the two statements.
    assertThat(executable.trim()).startsWith("ALTER TABLE ui_test_executions").endsWith(";");
  }

  /**
   * The control for the parser above.
   *
   * <p>A reader that matched nothing would make every assertion in this file vacuously true, and a
   * reader that matched the <em>comment</em> rather than the statement would pass while proving
   * nothing about the SQL that runs. Both are checked: the parse is non-empty, and the operator
   * remedy in the migration's comment — which repeats the same list — is <b>not</b> what was read.
   */
  @Test
  void theMigrationParserReadsTheStatementAndNotTheCommentThatRepeatsIt() {
    assertThat(migrationValues()).isNotEmpty();

    String sql = migrationText();
    int commentList = sql.indexOf("AND error_code NOT IN");
    assertThat(commentList)
        .as("the operator remedy in the comment carries the same list; it must exist to be a trap")
        .isGreaterThan(0);
    // The comment also spells `ADD CONSTRAINT ... NOT VALID` in prose, which is exactly the near
    // miss this control exists for: a parser anchored on that phrase alone would read the comment.
    assertThat(sql.indexOf("ADD CONSTRAINT")).isLessThan(commentList);

    Matcher matcher = CHECK_CLAUSE.matcher(sql);
    assertThat(matcher.find()).isTrue();
    assertThat(matcher.start())
        .as("what was parsed is the statement's list, not the comment's or the prose's")
        .isGreaterThan(commentList);
    assertThat(matcher.group("values"))
        .as("the captured group is the list itself and nothing around it")
        .doesNotContain("NOT IN")
        .doesNotContain("SELECT");
  }

  private static Set<String> migrationValues() {
    Matcher matcher = CHECK_CLAUSE.matcher(executableSql());
    assertThat(matcher.find())
        .as(
            "the CHECK clause could not be located in %s; the parser, not the SQL, is stale",
            MIGRATION)
        .isTrue();
    Set<String> values = new TreeSet<>();
    Matcher quoted = QUOTED.matcher(matcher.group("values"));
    while (quoted.find()) {
      values.add(quoted.group(1));
    }
    return values;
  }

  /**
   * The migration with every {@code --} comment removed.
   *
   * <p>Quote-aware so a value containing {@code --} could never truncate a statement. Nothing in
   * this migration's list does, and the day one does, this still reads the statement.
   */
  private static String executableSql() {
    StringBuilder stripped = new StringBuilder();
    for (String line : migrationText().split("\n", -1)) {
      boolean quoted = false;
      int cut = -1;
      for (int index = 0; index < line.length(); index++) {
        char current = line.charAt(index);
        if (current == '\'') {
          quoted = !quoted;
        } else if (!quoted
            && current == '-'
            && index + 1 < line.length()
            && line.charAt(index + 1) == '-') {
          cut = index;
          break;
        }
      }
      String code = cut < 0 ? line : line.substring(0, cut);
      if (!code.isBlank()) {
        stripped.append(code).append('\n');
      }
    }
    return stripped.toString();
  }

  private static String migrationText() {
    try {
      return Files.readString(MIGRATION, StandardCharsets.UTF_8);
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  @SuppressWarnings("unchecked")
  private static Set<String> contractEnum() {
    Map<String, Object> components = (Map<String, Object>) contract.get("components");
    Map<String, Object> schemas = (Map<String, Object>) components.get("schemas");
    Map<String, Object> schema = (Map<String, Object>) schemas.get("ExecutionErrorCode");
    List<Object> values = (List<Object>) schema.get("enum");
    List<String> declared = new ArrayList<>();
    // The contract's `null` member is the absence of a code, carried by the IS NULL disjunct.
    values.stream().filter(Objects::nonNull).forEach(value -> declared.add(String.valueOf(value)));
    return new TreeSet<>(declared);
  }
}
