data class LintViolation(
    val filePath: String,
    val lineNumber: Int,
    val statement: String,
    val ruleName: String,
    val hint: String
) {
    fun render(): String {
        val truncated = if (statement.length > 120) statement.take(117) + "..." else statement
        return "$filePath:$lineNumber: [$ruleName] $truncated\n  Hint: $hint"
    }
}

interface LintRule {
    val name: String
    val hint: String
    fun findViolations(strippedSql: String, filePath: String): List<LintViolation>
}

abstract class RegexLintRule(
    override val name: String,
    override val hint: String,
    private val pattern: Regex
) : LintRule {
    override fun findViolations(strippedSql: String, filePath: String): List<LintViolation> {
        return pattern.findAll(strippedSql).map { match ->
            LintViolation(
                filePath = filePath,
                lineNumber = lineNumberAt(strippedSql, match.range.first),
                statement = extractLine(strippedSql, match.range.first),
                ruleName = name,
                hint = hint
            )
        }.toList()
    }
}

fun lineNumberAt(text: String, position: Int): Int {
    return text.substring(0, position).count { it == '\n' } + 1
}

fun extractLine(text: String, position: Int): String {
    val lineStart = text.lastIndexOf('\n', position - 1).let { if (it < 0) 0 else it + 1 }
    val lineEnd = text.indexOf('\n', position).let { if (it < 0) text.length else it }
    return text.substring(lineStart, lineEnd).trim()
}
