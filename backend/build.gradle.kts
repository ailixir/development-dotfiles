import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

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

// Keep every Testcontainers module on the explicitly selected version; Boot otherwise
// managed JDBC/core at 1.19.8 beside the declared PostgreSQL/JUnit 1.20.2 modules.
val testcontainersVersion = "1.20.2"
extra["testcontainers.version"] = testcontainersVersion

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
    // The Prometheus scrape format for /actuator/prometheus. The worker exposes it on its
    // cluster-internal port only; the Studio runner autoscaler reads studio_dispatch_backlog from it.
    implementation("io.micrometer:micrometer-registry-prometheus")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("net.logstash.logback:logstash-logback-encoder:8.0")

    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-mail")
    implementation("org.springframework.boot:spring-boot-starter-aop")
    implementation("io.github.resilience4j:resilience4j-spring-boot3:2.2.0")
    implementation("com.github.ben-manes.caffeine:caffeine")

    developmentOnly("org.springframework.boot:spring-boot-devtools")
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.6.0")

    implementation("net.javacrumbs.shedlock:shedlock-spring:5.16.0")
    implementation("net.javacrumbs.shedlock:shedlock-provider-jdbc-template:5.16.0")

    // Current Google Gen AI SDK in Vertex AI mode (GenAiLlmGatewayClient). This replaces the retired
    // google-cloud-vertexai generative surface. SPK-01 still gates live R2D2 enablement.
    implementation("com.google.api:gax:2.76.0")
    implementation("com.google.genai:google-genai:1.71.0")

    // Runtime artifact-schema validation for the LLM gateway response parser (Story 10.5, AC-7).
    implementation("com.networknt:json-schema-validator:1.4.0")

    // Sonic is S3-compatible. Keep the adapter behind studio.execution.video-store.provider=s3;
    // local filesystem remains the shipped application default. The URLConnection transport is
    // deliberate: this service needs bounded synchronous Head/Get calls, not Netty or CRT.
    implementation(platform("software.amazon.awssdk:bom:2.55.1"))
    implementation("software.amazon.awssdk:s3") {
        // Keep Spring's existing HTTP client selection; Apache 5 otherwise adds automatic 429 retries.
        exclude(group = "software.amazon.awssdk", module = "apache5-client")
        exclude(group = "software.amazon.awssdk", module = "apache-client")
        exclude(group = "software.amazon.awssdk", module = "netty-nio-client")
    }
    implementation("software.amazon.awssdk:url-connection-client")

    implementation("org.flywaydb:flyway-core")
    runtimeOnly("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    // Zonky embedded Postgres — local profile only. Pinned to PG 15.6 (matches target RDS minor per ZK-R3).
    // embedded-postgres is the low-level builder. Tests use Testcontainers, not Zonky.
    implementation(platform("io.zonky.test.postgres:embedded-postgres-binaries-bom:15.6.0"))
    implementation("io.zonky.test:embedded-postgres:2.0.7")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.assertj:assertj-core")
    testImplementation("org.testcontainers:postgresql:$testcontainersVersion")
    testImplementation("org.testcontainers:junit-jupiter:$testcontainersVersion")
    testImplementation("org.wiremock:wiremock-standalone:3.3.1")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("com.icegreen:greenmail-junit5:2.0.1")
}

// Make the Zonky embedded-postgres dependency local-profile-only at runtime:
// it's on the main classpath (so LocalEmbeddedPostgresConfig compiles) but the @Profile("local")
// guard ensures EmbeddedPostgres only starts when explicitly activated.

tasks.withType<JavaCompile>().configureEach {
    options.compilerArgs.add("-parameters")
}

tasks.withType<Test>().configureEach {
    systemProperty("checks.test.buildDirectory", layout.buildDirectory.get().asFile.absolutePath)
    useJUnitPlatform()
    include("**/*Test.class", "**/*IT.class")
    // Story 10.7 AC-33 runs a *second* Spring application context with its own embedded servlet
    // container inside one test. That second container's threads keep the Gradle worker JVM alive
    // past the end of the class, so with forkEvery the worker cannot be recycled and the whole
    // run stalls. The test itself is sound and is not weakened: it is moved to its own forked
    // task below, which is wired into `check`, rather than deleted, downgraded or quarantined.
    exclude("**/SseCrossReplicaIT.class")
    testLogging {
        events("passed", "skipped", "failed")
    }
    jvmArgs("-Xmx1g")
    forkEvery = 12

    // Keep context reuse bounded and efficient. The test profile explicitly uses TC_DAEMON=true,
    // so connection/pool churn cannot stop its shared database while cached contexts still use it.
    systemProperty("spring.test.context.cache.maxSize", "64")

}


// STUDIO-OBS-009 AC-12 i / T0 ruling A14: the guided ITs spawn whatever studio-runner/dist exists, so the
// dependency is explicit. This task never builds the runner. It fails when dist/main.js is missing or older
// than any file under studio-runner/src, and `test` depends on it. A focused
// `--tests` run that selects no guided IT (no wildcard, no class named below) skips it, so unit runs of other
// classes are not held up by the runner build. Which dist a run spawned is recorded by the collectors
// (dist.digest before and after) and by RunnerProcessHarness.distDigest(); QA credits a guided IT run only
// when that digest is the F-merge build receipt's distDigestAfter.
val runnerSpawningTestClasses = listOf(
    "GuidedBridgeIntegrationTest",
    "GuidedBridgePlannedIT",
    "GuidedPlanningIntegrationTest",
    "GuidedLoginJourneyJoinedIT",
    "GuidedAuthoredEchoJoinedIT",
    "ObservedCoRunIT",
    "GuidedEvidencePendingAppendJoinedIT"
)
val requestedTestPatterns: List<String> = gradle.startParameter.taskRequests.flatMap { it.args }.let { args ->
    args.withIndex().filter { it.value == "--tests" }.mapNotNull { args.getOrNull(it.index + 1) } +
        args.filter { it.startsWith("--tests=") }.map { it.removePrefix("--tests=") }
}
val verifyRunnerDist = tasks.register("verifyRunnerDist") {
    group = "verification"
    description = "Fails if studio-runner/dist/main.js is missing or older than any file under studio-runner/src (never builds it)."
    val selected = requestedTestPatterns.isEmpty() ||
        requestedTestPatterns.any { pattern -> '*' in pattern || runnerSpawningTestClasses.any { it in pattern } }
    val entry = file("../studio-runner/dist/main.js")
    val sources = file("../studio-runner/src")
    onlyIf { selected }
    outputs.upToDateWhen { false }
    doLast {
        if (!entry.isFile) {
            throw GradleException("studio-runner/dist/main.js is missing. Build the runner first (cd studio-runner; pnpm run build); the backend build never builds it.")
        }
        val newest = fileTree(sources).files.maxByOrNull { it.lastModified() }
            ?: throw GradleException("No files under studio-runner/src")
        if (entry.lastModified() < newest.lastModified()) {
            throw GradleException(
                "studio-runner/dist/main.js (modified " + entry.lastModified() + " ms since the epoch) is older than " +
                    newest.relativeTo(file("..")).path + " (" + newest.lastModified() +
                    " ms). Rebuild the runner (clean first); the backend build never builds it.")
        }
    }
}
tasks.test { dependsOn(verifyRunnerDist) }

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
    maxHeapSize.set("2g")
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
    "**/entity/**",
    "**/generated/**"
)

tasks.jacocoTestReport {
    dependsOn(tasks.test)
    executionData.setFrom(layout.buildDirectory.file("jacoco/test.exec"))
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
    executionData.setFrom(layout.buildDirectory.file("jacoco/test.exec"))
    classDirectories.setFrom(tasks.jacocoTestReport.get().classDirectories)
    violationRules {
        rule {
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "0.70".toBigDecimal()
            }
        }
        // Story 10.7 AC-40: the dispatch and internal-callback packages carry their own
        // thresholds so the new surface cannot hide inside the bundle figure. These are the
        // reliability guarantees of Epic 10; a package-level number is the only way to notice
        // that one of them arrived untested.
        rule {
            element = "PACKAGE"
            includes = listOf("com.citi.put.checks.studio.dispatch")
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "0.75".toBigDecimal()
            }
        }
        rule {
            element = "PACKAGE"
            includes = listOf("com.citi.put.checks.studio.internal")
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "0.75".toBigDecimal()
            }
        }
        rule {
            element = "PACKAGE"
            includes = listOf("com.citi.put.checks.studio.recovery")
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "0.75".toBigDecimal()
            }
        }
        rule {
            element = "PACKAGE"
            includes = listOf("com.citi.put.checks.studio.sse")
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "0.75".toBigDecimal()
            }
        }
    }
}

/**
 * Story 10.7 AC-33 — cross-replica SSE visibility, in its own JVM.
 *
 * It runs two application contexts against one database, and the second one's embedded servlet
 * container outlives the test class. One class per fork keeps that contained.
 */
tasks.register<Test>("crossReplicaTest") {
    description = "Story 10.7 AC-33: two application contexts, one database, in an isolated JVM."
    group = "verification"
    testClassesDirs = sourceSets["test"].output.classesDirs
    classpath = sourceSets["test"].runtimeClasspath
    useJUnitPlatform()
    setIncludes(listOf("**/SseCrossReplicaIT.class"))
    setExcludes(emptyList<String>())
    forkEvery = 1
    jvmArgs("-Xmx1g")
    testLogging { events("passed", "skipped", "failed") }
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
    dependsOn(tasks.test)
    dependsOn("crossReplicaTest")
    dependsOn(tasks.jacocoTestCoverageVerification)
    dependsOn("rdsParityLint")
    dependsOn("antiRegressionCheck")
}

// Mixed JDBC/core/database modules caused intermittent initialization retries in the full suite.
tasks.register("testcontainersAlignmentCheck") {
    group = "verification"
    doLast {
        val modules = configurations["testRuntimeClasspath"].resolvedConfiguration.resolvedArtifacts
            .map { it.moduleVersion.id }
            .filter { it.group == "org.testcontainers" }
        check(modules.isNotEmpty() && modules.all { it.version == testcontainersVersion }) {
            "Testcontainers modules must all resolve to $testcontainersVersion: ${modules.joinToString()}"
        }
        logger.lifecycle("testcontainersAlignmentCheck: ${modules.size} modules aligned at $testcontainersVersion")
    }
}
tasks.named("check") { dependsOn("testcontainersAlignmentCheck") }

// Package the frozen observed contract directly; do not maintain a second Java schema copy.
tasks.processResources {
    from("../docs/specs/studio-observed-authoring/contracts") {
        include("v3/*.schema.json")
        into("studio/observed-contracts")
    }
}
