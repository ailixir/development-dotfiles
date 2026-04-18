import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.tasks.InputDirectory
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.PathSensitive
import org.gradle.api.tasks.PathSensitivity
import org.gradle.api.tasks.TaskAction

abstract class RdsParityLintTask : DefaultTask() {

    @get:InputDirectory
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val migrationDir: DirectoryProperty

    @get:InputFile
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val allowlistFile: RegularFileProperty

    @TaskAction
    fun lint() {
        val allowlist: Set<String>
        try {
            allowlist = AllowlistLoader.load(allowlistFile.get().asFile)
        } catch (e: Exception) {
            System.err.println("rdsParityLint: internal error — ${e.message}")
            throw GradleException("rdsParityLint internal error: ${e.message}", e)
        }

        val rules: List<LintRule> = listOf(
            AlterSystemRule,
            ExtensionAllowlistRule(allowlist),
            DropExtensionRule,
            SuperuserRule,
            LanguageCFunctionRule,
            CopyFromProgramRule,
            ServerFileRolesRule
        )

        val migDir = migrationDir.get().asFile
        if (!migDir.exists()) {
            logger.lifecycle("rdsParityLint: migration directory does not exist — nothing to lint.")
            return
        }

        val sqlFiles = migDir.walkTopDown()
            .filter { it.isFile && it.extension.equals("sql", ignoreCase = true) }
            .sortedBy { it.name }
            .toList()

        if (sqlFiles.isEmpty()) {
            logger.lifecycle("rdsParityLint: no .sql files found in ${migDir.path}")
            return
        }

        val violations = mutableListOf<LintViolation>()

        for (file in sqlFiles) {
            val rawSql = file.readText()
            val stripped = CommentStripper.strip(rawSql)

            for (rule in rules) {
                violations.addAll(rule.findViolations(stripped, file.path))
            }
        }

        if (violations.isNotEmpty()) {
            System.err.println()
            violations.forEach { v ->
                System.err.println(v.render())
                System.err.println()
            }
            throw GradleException("rdsParityLint: ${violations.size} violation(s) found. See stderr above.")
        }

        logger.lifecycle("rdsParityLint: ${sqlFiles.size} migration file(s) checked — clean.")
    }
}
