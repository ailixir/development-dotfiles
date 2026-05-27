object AlterSystemRule : RegexLintRule(
    name = "no-alter-system",
    hint = "ALTER SYSTEM is not available on Amazon RDS. Use parameter groups instead.",
    pattern = Regex("\\bALTER\\s+SYSTEM\\b", RegexOption.IGNORE_CASE)
)
