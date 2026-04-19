plugins {
    java
    id("org.springframework.boot") version "3.3.5"
    id("io.spring.dependency-management") version "1.1.6"
    id("org.flywaydb.flyway") version "10.20.1"
    id("com.diffplug.spotless") version "6.25.0"
    checkstyle
    id("com.github.spotbugs") version "6.0.22"
    jacoco
}

group = "com.citi.put"
version = "0.1.0-SNAPSHOT"
description = "PUT Checks — backend service"

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("net.logstash.logback:logstash-logback-encoder:8.0")

    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-aop")
    implementation("io.github.resilience4j:resilience4j-spring-boot3:2.2.0")
    implementation("com.github.ben-manes.caffeine:caffeine")

    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.6.0")

    implementation("net.javacrumbs.shedlock:shedlock-spring:5.16.0")
    implementation("net.javacrumbs.shedlock:shedlock-provider-jdbc-template:5.16.0")

    implementation("org.flywaydb:flyway-core")
    runtimeOnly("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    // Zonky embedded Postgres — local profile only. Pinned to PG 15.6 (matches target RDS minor per ZK-R3).
    // embedded-postgres is the low-level builder; embedded-database-spring-test adds @AutoConfigureEmbeddedDatabase (test-only).
    implementation(platform("io.zonky.test.postgres:embedded-postgres-binaries-bom:15.6.0"))
    implementation("io.zonky.test:embedded-postgres:2.0.7")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.assertj:assertj-core")
    testImplementation("com.networknt:json-schema-validator:1.4.0")
    testImplementation("io.zonky.test:embedded-database-spring-test:2.5.1")
    testImplementation("org.testcontainers:postgresql:1.20.2")
    testImplementation("org.testcontainers:junit-jupiter:1.20.2")
    testImplementation("org.wiremock:wiremock-standalone:3.3.1")
    testImplementation("org.springframework.security:spring-security-test")
}

// Make the Zonky embedded-postgres dependency local-profile-only at runtime:
// it's on the main classpath (so LocalEmbeddedPostgresConfig compiles) but the @Profile("local")
// guard ensures EmbeddedPostgres only starts when explicitly activated.

tasks.withType<JavaCompile>().configureEach {
    options.compilerArgs.add("-parameters")
}

tasks.withType<Test>().configureEach {
    useJUnitPlatform()
    include("**/*Test.class", "**/*IT.class")
    testLogging {
        events("passed", "skipped", "failed")
    }
}

spotless {
    java {
        googleJavaFormat("1.22.0")
        target("src/**/*.java")
        removeUnusedImports()
        trimTrailingWhitespace()
        endWithNewline()
    }
}

checkstyle {
    toolVersion = "10.18.1"
    configFile = file("config/checkstyle/checkstyle.xml")
    isIgnoreFailures = false
    maxWarnings = 0
}

tasks.withType<Checkstyle>().configureEach {
    reports {
        html.required.set(true)
        xml.required.set(false)
    }
}

spotbugs {
    ignoreFailures.set(false)
    excludeFilter.set(file("config/spotbugs/exclude.xml"))
    reportLevel.set(com.github.spotbugs.snom.Confidence.HIGH)
}

tasks.named("spotbugsTest") {
    enabled = false
}

jacoco {
    toolVersion = "0.8.12"
}

val jacocoExcludes = listOf(
    "com/citi/put/checks/ChecksApplication.class",
    "**/dto/**",
    "**/generated/**"
)

tasks.jacocoTestReport {
    dependsOn(tasks.test)
    reports {
        html.required.set(true)
        xml.required.set(true)
    }
    classDirectories.setFrom(
        files(classDirectories.files.map {
            fileTree(it) { exclude(jacocoExcludes) }
        })
    )
}

tasks.jacocoTestCoverageVerification {
    dependsOn(tasks.jacocoTestReport)
    classDirectories.setFrom(tasks.jacocoTestReport.get().classDirectories)
    violationRules {
        rule {
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "0.75".toBigDecimal()
            }
        }
    }
}

tasks.register<RdsParityLintTask>("rdsParityLint") {
    migrationDir.set(file("src/main/resources/db/migration"))
    allowlistFile.set(file("config/rds-parity/allowlist.yml"))
}

tasks.register("antiRegressionCheck") {
    description = "DEBT-04: Blocks spring-boot-starter-oauth2-resource-server and OIDC config keys"
    doLast {
        val forbidden = "oauth2-resource-server"
        val runtimeDeps = configurations["runtimeClasspath"].resolve().map { it.name }
        val found = runtimeDeps.filter { it.contains(forbidden) }
        if (found.isNotEmpty()) {
            throw GradleException(
                "DEBT-04 anti-regression: forbidden dependency found: $found. " +
                "put-checks uses BFF session auth, not direct JWT validation."
            )
        }

        val configFiles = fileTree("src/main/resources") {
            include("application*.yml", "application*.yaml", "application*.properties")
        }
        val forbiddenKeys = listOf(
            "spring.security.oauth2.resourceserver.jwt.issuer-uri",
            "CHECKS_OIDC_ISSUER"
        )
        configFiles.forEach { file ->
            val content = file.readText()
            forbiddenKeys.forEach { key ->
                if (content.contains(key)) {
                    throw GradleException(
                        "DEBT-04 anti-regression: forbidden config key '$key' found in ${file.name}."
                    )
                }
            }
        }
        logger.lifecycle("antiRegressionCheck: DEBT-04 clean — no forbidden deps or config keys.")
    }
}

tasks.check {
    dependsOn(tasks.jacocoTestCoverageVerification)
    dependsOn("rdsParityLint")
    dependsOn("antiRegressionCheck")
}
