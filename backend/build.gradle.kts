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

    // Current Google Gen AI SDK in Vertex AI mode. This replaces the retired
    // google-cloud-vertexai generative surface.
    implementation("com.google.genai:google-genai:1.72.0")

    // Runtime artifact-schema validation for the LLM gateway response parser (Story 10.5, AC-7).
    implementation("com.networknt:json-schema-validator:1.4.0")

    // Sonic is S3-compatible. Keep the adapter behind studio.execution.video-store.provider=s3;
    // local filesystem remains the shipped application default. The URLConnection transport is
    // deliberate: this service needs bounded synchronous Head/Get calls, not Netty or CRT.
    implementation(platform("software.amazon.awssdk:bom:2.55.1"))
    implementation("software.amazon.awssdk:s3")
    implementation("software.amazon.awssdk:url-connection-client")

    implementation("org.flywaydb:flyway-core")
    runtimeOnly("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    // Zonky embedded Postgres — local profile only. Pinned to PG 15.6 (matches target RDS minor per ZK-R3).
    // embedded-postgres is the low-level builder; embedded-database-spring-test adds @AutoConfigureEmbeddedDatabase (test-only).
    implementation(platform("io.zonky.test.postgres:embedded-postgres-binaries-bom:15.6.0"))
    implementation("io.zonky.test:embedded-postgres:2.0.7")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.assertj:assertj-core")
    testImplementation("io.zonky.test:embedded-database-spring-test:2.5.1")
    testImplementation("org.testcontainers:postgresql:1.20.2")
    testImplementation("org.testcontainers:junit-jupiter:1.20.2")
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

    // The Testcontainers JDBC driver stops its container when the connection count for a URL
    // reaches zero. Spring's context cache defaults to 32 entries, and story 10.7 pushed the
    // suite past that: evicting a context closes its Hikari pool, the count hits zero, the
    // container stops, and every other cached context is left pointed at a dead port. The symptom
    // is "Connection refused" in tests that pass in isolation and fail in the suite. Raising the
    // cache keeps the contexts — and therefore the container — alive for the fork's lifetime.
    systemProperty("spring.test.context.cache.maxSize", "64")

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
    "**/entity/**",
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
                minimum = "0.70".toBigDecimal()
            }
        }
        // Story 10.5 AC-15: the R2D2 gateway client carries a higher bar than the repo baseline.
        rule {
            element = "PACKAGE"
            includes = listOf("com.citi.put.checks.studio.compile.gateway")
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "0.80".toBigDecimal()
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
        // Story 10.9 AC-23: the compile package is this story's main new surface — the repair
        // loop, the confirmation transaction and the abandoned-compile sweep all live in it. The
        // bar matches the one story 10.5 set for its sibling `.gateway` package, for the same
        // reason 10.7 gave: a package-level number is the only way to notice that one of these
        // arrived untested, because the bundle figure absorbs it. Measured 90.6% when the rule was
        // added, so this enforces what was measured rather than raising the bar to it.
        rule {
            element = "PACKAGE"
            includes = listOf("com.citi.put.checks.studio.compile")
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                minimum = "0.80".toBigDecimal()
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
    dependsOn("crossReplicaTest")
    dependsOn(tasks.jacocoTestCoverageVerification)
    dependsOn("rdsParityLint")
    dependsOn("antiRegressionCheck")
}
