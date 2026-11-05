# RDS-Parity Lint

A Gradle task that statically scans Flyway migrations for PostgreSQL features unavailable on managed Amazon RDS instances.

## Why

Zonky embedded Postgres (local and tests, on every OS) runs as SUPERUSER by default. A migration that works locally might fail on RDS at deploy time because RDS restricts SUPERUSER operations, non-allowlisted extensions, and server-side file access. This lint catches those issues before code leaves the developer's machine.

Research references: ZK-04 (Zonky SUPERUSER), ZK-06 (RDS extension allowlist), ZK-R2 (lint gate recommendation).

## Usage

```bash
./gradlew rdsParityLint       # Run lint standalone
./gradlew check               # Lint runs as part of the full quality gate
```

## Rules

| Rule | Pattern | Rejects |
|------|---------|---------|
| `no-alter-system` | `ALTER SYSTEM` | Any form of ALTER SYSTEM (use RDS parameter groups) |
| `extension-allowlist` | `CREATE EXTENSION <name>` | Extension name not in `allowlist.yml` |
| `no-drop-extension` | `DROP EXTENSION` | Any extension removal |
| `no-superuser` | `ALTER USER/ROLE ... SUPERUSER`, `CREATE ROLE ... SUPERUSER` | SUPERUSER role attribute grants |
| `no-language-c` | `LANGUAGE C` | C-language function definitions |
| `no-copy-from-program` | `FROM PROGRAM` | Server-side program execution via COPY |
| `no-server-file-roles` | `pg_read_server_files`, `pg_write_server_files`, `pg_execute_server_program` | Server file access role grants |

## Extension Allowlist

The allowlist at `allowlist.yml` controls which extensions are permitted in migrations:

```yaml
extensions:
  - pgcrypto
  - uuid-ossp
  - pg_stat_statements
  - hstore
  - btree_gin
  - btree_gist
```

### Adding an extension

1. Confirm the extension is enabled in the target RDS cluster's parameter group.
2. Add the entry to `allowlist.yml`.
3. Open a PR. **Do not self-merge** — a teammate must review.
4. In the PR description, explain why the extension is needed and confirm RDS availability.

## Error Output

When violations are found, each is reported with:
- Full path to the violating file
- Line number
- Offending statement (truncated at 120 chars)
- Rule name
- Remediation hint

Example:
```
src/main/resources/db/migration/V2__bad.sql:5: [no-alter-system] ALTER SYSTEM SET work_mem = '256MB'
  Hint: ALTER SYSTEM is not available on Amazon RDS. Use parameter groups instead.
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Clean — no violations |
| 1 | Violations found (Gradle task failure) |
| 1 | Internal error (malformed allowlist, missing config) — distinguished by error message prefix `rdsParityLint: internal error` |

Note: Gradle does not support custom exit codes from tasks. Both violations and internal errors result in a non-zero exit. The error message format distinguishes them.

## False Positives

The lint uses regex-based matching, not a full SQL parser. Known edge cases:
- Keywords inside dollar-quoted function bodies are visible to the scanner. In practice, trigger/function bodies do not contain the violation patterns. If a false positive surfaces, file an issue.
- `ALTER TABLE` does NOT match the `ALTER SYSTEM` rule (word-boundary matching).
- `COPY FROM '/path/file'` (no PROGRAM keyword) does NOT match the `no-copy-from-program` rule.

## Comment Handling

The lint strips SQL comments before scanning:
- Line comments (`--` to end of line)
- Block comments (`/* ... */`)

String literals (single-quoted and dollar-quoted) are preserved and not mistaken for comments.
