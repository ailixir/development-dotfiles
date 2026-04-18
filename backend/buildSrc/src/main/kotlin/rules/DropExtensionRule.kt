object DropExtensionRule : RegexLintRule(
    name = "no-drop-extension",
    hint = "DROP EXTENSION is blocked. Extensions are managed by the DBA team via RDS parameter groups.",
    pattern = Regex("\\bDROP\\s+EXTENSION\\b", RegexOption.IGNORE_CASE)
)
