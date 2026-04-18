object ServerFileRolesRule : RegexLintRule(
    name = "no-server-file-roles",
    hint = "Server file access roles (pg_read_server_files, pg_write_server_files, pg_execute_server_program) are restricted on Amazon RDS.",
    pattern = Regex(
        "\\b(?:pg_read_server_files|pg_write_server_files|pg_execute_server_program)\\b",
        RegexOption.IGNORE_CASE
    )
)
