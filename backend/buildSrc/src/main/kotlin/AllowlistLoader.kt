import org.yaml.snakeyaml.Yaml
import java.io.File

object AllowlistLoader {

    fun load(file: File): Set<String> {
        if (!file.exists()) {
            throw IllegalStateException("Allowlist file not found: ${file.absolutePath}")
        }
        val yaml = Yaml()
        val data: Map<String, Any> = file.inputStream().use { yaml.load(it) }
            ?: throw IllegalStateException("Allowlist file is empty: ${file.absolutePath}")

        val extensions = data["extensions"] as? List<*>
            ?: throw IllegalStateException(
                "Allowlist file must contain an 'extensions' key with a list: ${file.absolutePath}"
            )
        return extensions.map { it.toString().lowercase().trim() }.toSet()
    }
}
