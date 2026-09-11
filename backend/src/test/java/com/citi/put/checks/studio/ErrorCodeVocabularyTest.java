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
 *   <li>the SQL — parsed out of {@code V17__studio_execution_error_code_check.sql}'s {@code CHECK …
 *       IN (…)};
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
      Path.of(
          "src",
          "main",
          "resources",
          "db",
          "migration",
          "V17__studio_execution_error_code_check.sql");

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
   */
  @Test
  void theConstraintIsAddedNotValidAndValidatedSeparately() {
    String sql = migrationText();

    assertThat(sql).containsIgnoringCase("NOT VALID");
    assertThat(sql)
        .containsIgnoringCase(
            "ALTER TABLE ui_test_executions VALIDATE CONSTRAINT ck_ui_test_executions_error_code");
    assertThat(sql.toUpperCase(java.util.Locale.ROOT).indexOf("NOT VALID"))
        .as("VALIDATE must come after the NOT VALID add, not before it")
        .isLessThan(sql.toUpperCase(java.util.Locale.ROOT).indexOf("VALIDATE CONSTRAINT"));
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
    Matcher matcher = CHECK_CLAUSE.matcher(migrationText());
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
