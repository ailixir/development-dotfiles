class ExtensionAllowlistRule(private val allowlist: Set<String>) : LintRule {

    override val name = "extension-allowlist"
    override val hint =
        "Extension not in the allowlist at backend/config/rds-parity/allowlist.yml. " +
        "Escalate to the DBA team to expand it."

    private val pattern = Regex(
        "\\bCREATE\\s+EXTENSION\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:\"([^\"]+)\"|([A-Za-z_][A-Za-z0-9_-]*))",
        RegexOption.IGNORE_CASE
    )

    override fun findViolations(strippedSql: String, filePath: String): List<LintViolation> {
        return pattern.findAll(strippedSql).mapNotNull { match ->
            val extName = (match.groupValues[1].ifEmpty { null } ?: match.groupValues[2]).lowercase()
            if (extName in allowlist) {
                null
            } else {
                LintViolation(
                    filePath = filePath,
                    lineNumber = lineNumberAt(strippedSql, match.range.first),
                    statement = extractLine(strippedSql, match.range.first),
                    ruleName = name,
                    hint = hint
                )
            }
        }.toList()
    }
}
