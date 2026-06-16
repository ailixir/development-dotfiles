plugins {
    `kotlin-dsl`
}

repositories {
    citiArtifactoryRepository(
        repositoryUrl = providers.citiGradleProperty("citiMavenRepositoryUrl", "citiArtifactoryUrl"),
        repositoryName = "citiMaven",
        username = providers.citiGradleProperty("citiArtifactoryUser", "citiEarUser"),
        password = providers.citiGradleProperty(
            "citiArtifactoryPassword",
            "citiArtifactoryToken",
            "citiEarPassword"
        )
    )
    mavenCentral()
}

dependencies {
    implementation("org.yaml:snakeyaml:2.2")
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.3")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.test {
    useJUnitPlatform()
    systemProperty("project.root", rootProject.projectDir.parentFile.absolutePath)
}

fun org.gradle.api.provider.ProviderFactory.citiGradleProperty(
    primaryName: String,
    vararg aliasNames: String
): String? =
    aliasNames
        .fold(gradleProperty(primaryName)) { current, aliasName -> current.orElse(gradleProperty(aliasName)) }
        .orNull

fun org.gradle.api.artifacts.dsl.RepositoryHandler.citiArtifactoryRepository(
    repositoryUrl: String?,
    repositoryName: String,
    username: String?,
    password: String?
) {
    if (repositoryUrl.isNullOrBlank()) {
        return
    }

    maven {
        name = repositoryName
        url = uri(repositoryUrl)

        if (!username.isNullOrBlank() && !password.isNullOrBlank()) {
            credentials(org.gradle.api.credentials.PasswordCredentials::class) {
                this.username = username
                this.password = password
            }
            authentication {
                create<org.gradle.authentication.http.BasicAuthentication>("basic")
            }
        }
    }
}
