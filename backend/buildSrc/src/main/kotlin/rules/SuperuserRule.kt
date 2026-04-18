object SuperuserRule : RegexLintRule(
    name = "no-superuser",
    hint = "SUPERUSER role attribute is not available on Amazon RDS. Use IAM database authentication or standard roles.",
    pattern = Regex(
        "\\b(?:ALTER\\s+(?:USER|ROLE)|CREATE\\s+ROLE)\\b[^;]*\\bSUPERUSER\\b",
        setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL)
    )
)
