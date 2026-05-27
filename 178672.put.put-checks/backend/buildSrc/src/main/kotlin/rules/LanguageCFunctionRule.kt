object LanguageCFunctionRule : RegexLintRule(
    name = "no-language-c",
    hint = "C-language functions are blocked on Amazon RDS. Use PL/pgSQL or another supported language.",
    pattern = Regex("\\bLANGUAGE\\s+C\\b", RegexOption.IGNORE_CASE)
)
