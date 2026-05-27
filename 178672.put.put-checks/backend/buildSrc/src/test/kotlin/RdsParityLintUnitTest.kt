import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

class RdsParityLintUnitTest {

    private val allowlist = setOf("pgcrypto", "uuid-ossp", "pg_stat_statements", "hstore", "btree_gin", "btree_gist")
    private val projectRoot = File(System.getProperty("project.root"))
    private val fixturesDir = File(projectRoot, "src/test/resources/rds-parity-fixtures")

    private fun allRules(): List<LintRule> = listOf(
        AlterSystemRule,
        ExtensionAllowlistRule(allowlist),
        DropExtensionRule,
        SuperuserRule,
        LanguageCFunctionRule,
        CopyFromProgramRule,
        ServerFileRolesRule
    )

    private fun lintFile(file: File): List<LintViolation> {
        val stripped = CommentStripper.strip(file.readText())
        return allRules().flatMap { it.findViolations(stripped, file.path) }
    }

    // ── Positive fixture ──────────────────────────────────────────

    @Test
    fun `positive fixture produces zero violations`() {
        val file = File(fixturesDir, "ok/V9999__all_legal.sql")
        assertTrue(file.exists(), "Positive fixture missing: ${file.path}")
        val violations = lintFile(file)
        assertEquals(0, violations.size, "Expected 0 violations but got:\n${violations.joinToString("\n") { it.render() }}")
    }

    // ── Negative fixtures ─────────────────────────────────────────

    @Test
    fun `detects ALTER SYSTEM`() {
        val file = File(fixturesDir, "bad/V9999__alter_system.sql")
        val violations = lintFile(file)
        assertTrue(violations.isNotEmpty(), "Expected violations for ALTER SYSTEM")
        assertTrue(violations.all { it.ruleName == "no-alter-system" })
        assertEquals(2, violations.size, "Expected 2 ALTER SYSTEM violations")
        assertEquals(4, violations[0].lineNumber)
        assertEquals(5, violations[1].lineNumber)
    }

    @Test
    fun `detects unknown extension`() {
        val file = File(fixturesDir, "bad/V9999__unknown_extension.sql")
        val violations = lintFile(file)
        assertTrue(violations.isNotEmpty(), "Expected violations for unknown extension")
        assertTrue(violations.all { it.ruleName == "extension-allowlist" })
        assertEquals(4, violations[0].lineNumber)
    }

    @Test
    fun `detects DROP EXTENSION`() {
        val file = File(fixturesDir, "bad/V9999__drop_extension.sql")
        val violations = lintFile(file)
        assertTrue(violations.isNotEmpty(), "Expected violations for DROP EXTENSION")
        assertTrue(violations.all { it.ruleName == "no-drop-extension" })
        assertEquals(4, violations[0].lineNumber)
    }

    @Test
    fun `detects SUPERUSER role attribute`() {
        val file = File(fixturesDir, "bad/V9999__superuser.sql")
        val violations = lintFile(file)
        assertTrue(violations.isNotEmpty(), "Expected violations for SUPERUSER")
        assertTrue(violations.all { it.ruleName == "no-superuser" })
        assertEquals(3, violations.size, "Expected 3 SUPERUSER violations")
        assertEquals(4, violations[0].lineNumber)
        assertEquals(5, violations[1].lineNumber)
        assertEquals(6, violations[2].lineNumber)
    }

    @Test
    fun `detects LANGUAGE C function`() {
        val file = File(fixturesDir, "bad/V9999__language_c.sql")
        val violations = lintFile(file)
        assertTrue(violations.isNotEmpty(), "Expected violations for LANGUAGE C")
        assertTrue(violations.all { it.ruleName == "no-language-c" })
        assertEquals(7, violations[0].lineNumber)
    }

    @Test
    fun `detects COPY FROM PROGRAM`() {
        val file = File(fixturesDir, "bad/V9999__copy_from_program.sql")
        val violations = lintFile(file)
        assertTrue(violations.isNotEmpty(), "Expected violations for COPY FROM PROGRAM")
        assertTrue(violations.all { it.ruleName == "no-copy-from-program" })
        assertEquals(4, violations[0].lineNumber)
    }

    @Test
    fun `detects server file role grants`() {
        val file = File(fixturesDir, "bad/V9999__server_file_roles.sql")
        val violations = lintFile(file)
        assertTrue(violations.isNotEmpty(), "Expected violations for server file roles")
        assertTrue(violations.all { it.ruleName == "no-server-file-roles" })
        assertEquals(3, violations.size, "Expected 3 server file role violations")
        assertEquals(4, violations[0].lineNumber)
        assertEquals(5, violations[1].lineNumber)
        assertEquals(6, violations[2].lineNumber)
    }

    // ── Rule-level unit tests ─────────────────────────────────────

    @Test
    fun `ALTER TABLE does not match ALTER SYSTEM`() {
        val sql = "ALTER TABLE users ADD COLUMN email TEXT;"
        val violations = AlterSystemRule.findViolations(sql, "test.sql")
        assertEquals(0, violations.size)
    }

    @Test
    fun `allowlisted extension passes`() {
        val rule = ExtensionAllowlistRule(allowlist)
        val sql = "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
        val violations = rule.findViolations(sql, "test.sql")
        assertEquals(0, violations.size)
    }

    @Test
    fun `allowlisted double-quoted extension passes`() {
        val rule = ExtensionAllowlistRule(allowlist)
        val sql = """CREATE EXTENSION IF NOT EXISTS "uuid-ossp";"""
        val violations = rule.findViolations(sql, "test.sql")
        assertEquals(0, violations.size)
    }

    @Test
    fun `regular COPY FROM path is not flagged`() {
        val sql = "COPY test_table FROM '/tmp/data.csv' WITH (FORMAT csv);"
        val violations = CopyFromProgramRule.findViolations(sql, "test.sql")
        assertEquals(0, violations.size)
    }

    @Test
    fun `LANGUAGE plpgsql is not flagged`() {
        val sql = "CREATE FUNCTION f() RETURNS void AS \$\$ BEGIN END; \$\$ LANGUAGE plpgsql;"
        val violations = LanguageCFunctionRule.findViolations(sql, "test.sql")
        assertEquals(0, violations.size)
    }

    @Test
    fun `standard role creation without SUPERUSER passes`() {
        val sql = "CREATE ROLE app_reader WITH LOGIN PASSWORD 'changeme';"
        val violations = SuperuserRule.findViolations(sql, "test.sql")
        assertEquals(0, violations.size)
    }

    @Test
    fun `violation render truncates long statements`() {
        val longStatement = "A".repeat(200)
        val violation = LintViolation("test.sql", 1, longStatement, "test-rule", "Fix it.")
        val rendered = violation.render()
        assertTrue(rendered.contains("..."))
        assertTrue(rendered.contains("[test-rule]"))
        assertTrue(rendered.contains("Hint: Fix it."))
    }

    // ── Real V1 migration ─────────────────────────────────────────

    @Test
    fun `V1 init migration passes cleanly`() {
        val v1 = File(projectRoot, "src/main/resources/db/migration/V1__init.sql")
        if (!v1.exists()) {
            println("V1__init.sql not found — skipping real-migration test")
            return
        }
        val violations = lintFile(v1)
        assertEquals(0, violations.size, "V1__init.sql should pass cleanly but got:\n${violations.joinToString("\n") { it.render() }}")
    }
}
