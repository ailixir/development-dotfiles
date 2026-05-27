import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class CommentStripperTest {

    @Test
    fun `strips line comments`() {
        val sql = "SELECT 1; -- this is a comment\nSELECT 2;"
        val stripped = CommentStripper.strip(sql)
        assertFalse(stripped.contains("this is a comment"))
        assertTrue(stripped.contains("SELECT 1;"))
        assertTrue(stripped.contains("SELECT 2;"))
    }

    @Test
    fun `strips block comments preserving newlines`() {
        val sql = "SELECT 1;\n/* multi\nline\ncomment */\nSELECT 2;"
        val stripped = CommentStripper.strip(sql)
        assertFalse(stripped.contains("multi"))
        assertFalse(stripped.contains("comment"))
        assertTrue(stripped.contains("SELECT 1;"))
        assertTrue(stripped.contains("SELECT 2;"))
        assertEquals(sql.count { it == '\n' }, stripped.count { it == '\n' })
    }

    @Test
    fun `preserves single-quoted strings containing comment markers`() {
        val sql = "INSERT INTO t VALUES ('-- not a comment');"
        val stripped = CommentStripper.strip(sql)
        assertTrue(stripped.contains("-- not a comment"))
    }

    @Test
    fun `preserves dollar-quoted strings containing comment markers`() {
        val sql = """CREATE FUNCTION f() RETURNS void AS ${'$'}${'$'}
BEGIN
    -- this is inside a dollar-quoted body
    RAISE NOTICE 'hello';
END;
${'$'}${'$'} LANGUAGE plpgsql;"""
        val stripped = CommentStripper.strip(sql)
        assertTrue(stripped.contains("-- this is inside a dollar-quoted body"))
        assertTrue(stripped.contains("LANGUAGE plpgsql"))
    }

    @Test
    fun `preserves double-quoted identifiers`() {
        val sql = """CREATE EXTENSION IF NOT EXISTS "uuid-ossp";"""
        val stripped = CommentStripper.strip(sql)
        assertTrue(stripped.contains("\"uuid-ossp\""))
    }

    @Test
    fun `handles escaped single quotes`() {
        val sql = "INSERT INTO t VALUES ('it''s a test');"
        val stripped = CommentStripper.strip(sql)
        assertTrue(stripped.contains("it''s a test"))
    }

    @Test
    fun `strips inline comment after statement`() {
        val sql = "ALTER SYSTEM SET work_mem = '256MB'; -- danger"
        val stripped = CommentStripper.strip(sql)
        assertTrue(stripped.contains("ALTER SYSTEM"))
        assertFalse(stripped.contains("danger"))
    }

    @Test
    fun `handles named dollar tags`() {
        val sql = """CREATE FUNCTION f() RETURNS trigger AS ${'$'}body${'$'}
BEGIN
    RETURN NEW;
END;
${'$'}body${'$'} LANGUAGE plpgsql;"""
        val stripped = CommentStripper.strip(sql)
        assertTrue(stripped.contains("RETURN NEW"))
        assertTrue(stripped.contains("LANGUAGE plpgsql"))
    }

    @Test
    fun `empty input returns empty`() {
        assertEquals("", CommentStripper.strip(""))
    }

    @Test
    fun `comment-only file returns whitespace`() {
        val sql = "-- just a comment\n/* block */\n"
        val stripped = CommentStripper.strip(sql)
        assertTrue(stripped.isBlank())
    }
}
