object CopyFromProgramRule : RegexLintRule(
    name = "no-copy-from-program",
    hint = "COPY ... FROM PROGRAM enables server-side command execution, which is blocked on Amazon RDS.",
    pattern = Regex("\\bFROM\\s+PROGRAM\\b", RegexOption.IGNORE_CASE)
)
