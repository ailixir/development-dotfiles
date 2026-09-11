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
    implementation("org.springframework.boot:spring-boot-starter-mail")
    implementation("org.springframework.boot:spring-boot-starter-aop")
    implementation("io.github.resilience4j:resilience4j-spring-boot3:2.2.0")
    implementation("com.github.ben-manes.caffeine:caffeine")

    developmentOnly("org.springframework.boot:spring-boot-devtools")
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.6.0")

    implementation("net.javacrumbs.shedlock:shedlock-spring:5.16.0")
    implementation("net.javacrumbs.shedlock:shedlock-provider-jdbc-template:5.16.0")

    // Google Vertex AI SDK — R2D2 gateway transport (Story 10.5, arch §4.1).
    // unverified-against-R2D2: pinned for stub tests; SPK-01 must confirm the version R2D2 accepts.
    //
    // The gateway client is httpjson/REST only (VertexAiClientFactory builds the transport with
    // PredictionServiceSettings.newHttpJsonBuilder()). The SDK's flattened POM nevertheless
    // declares the whole gRPC/Netty/xDS stack and the new google-genai surface. None of it is on
    // an executed path, so it is excluded rather than left as unpinned supply-chain surface
    // (ADR-001 exact pinning; QA gate 10.5 MED-001).
    implementation("com.google.cloud:google-cloud-vertexai:1.52.0") {
        // gRPC transport plugins, load balancers and the bundled TLS provider — grpc only.
        exclude(group = "io.grpc", module = "grpc-netty-shaded")
        exclude(group = "io.grpc", module = "grpc-xds")
        exclude(group = "io.grpc", module = "grpc-alts")
        exclude(group = "io.grpc", module = "grpc-grpclb")
        exclude(group = "io.grpc", module = "grpc-googleapis")
        exclude(group = "io.grpc", module = "grpc-services")
        exclude(group = "org.conscrypt", module = "conscrypt-openjdk-uber")
        exclude(group = "io.perfmark", module = "perfmark-api")
        exclude(group = "com.google.re2j", module = "re2j")
        // gRPC runtime: channel implementation, generated-stub support and the in-process
        // transport. Only the three Grpc*Stub classes need them and the httpjson path never
        // loads those. KEPT ON PURPOSE: io.grpc:grpc-api and com.google.api:gax-grpc —
        // PredictionServiceStubSettings.createStub() tests `instanceof GrpcTransportChannel`
        // before it reaches the httpjson branch, so both are required at runtime even here.
        exclude(group = "io.grpc", module = "grpc-core")
        exclude(group = "io.grpc", module = "grpc-inprocess")
        exclude(group = "io.grpc", module = "grpc-util")
        exclude(group = "io.grpc", module = "grpc-auth")
        exclude(group = "io.grpc", module = "grpc-stub")
        exclude(group = "io.grpc", module = "grpc-protobuf")
        exclude(group = "io.grpc", module = "grpc-protobuf-lite")
        // gRPC service stubs for common/IAM protos. The proto-google-* message jars are kept:
        // httpjson transcodes the same protobuf messages.
        exclude(group = "com.google.api.grpc", module = "grpc-google-common-protos")
        exclude(group = "com.google.api.grpc", module = "grpc-google-iam-v1")
        // com.google.genai — the standalone Google Gen AI SDK. Dev Decision 3 chose the
        // VertexAI/GenerativeModel surface precisely so this artifact would not be adopted, but
        // the flattened POM ships it anyway. Every reference to com.google.genai inside
        // google-cloud-vertexai-1.52.0 is confined to com.google.cloud.vertexai.genai.*, which
        // this client never touches; VertexAI, GenerativeModel and ResponseHandler have none.
        // okhttp/okio/Java-WebSocket/kotlin-stdlib are its transport and come with it.
        exclude(group = "com.google.genai", module = "google-genai")
        exclude(group = "com.squareup.okhttp3", module = "okhttp")
        exclude(group = "com.squareup.okio", module = "okio")
        exclude(group = "com.squareup.okio", module = "okio-jvm")
        exclude(group = "org.java-websocket", module = "Java-WebSocket")
        exclude(group = "org.jetbrains.kotlin")
    }

    // Runtime artifact-schema validation for the LLM gateway response parser (Story 10.5, AC-7).
    implementation("com.networknt:json-schema-validator:1.4.0")

    // ADR-001 exact pinning for what survives the exclusions above. google-cloud-vertexai
    // declares these without a BOM, so without constraints their versions move whenever the
    // Vertex pin moves. Each value is the version actually resolved and tested at 1.52.0.
    // These are `require` constraints: they make the resolved set explicit and reviewable and
    // hold the floor, but a later Vertex pin asking for a higher version still wins conflict
    // resolution — SPK-01 must re-review this list whenever the Vertex version changes.
    constraints {
        implementation("com.google.api:api-common:2.59.0")
        implementation("com.google.api:gax:2.76.0")
        implementation("com.google.api:gax-httpjson:2.76.0")
        implementation("com.google.api:gax-grpc:2.76.0")
        implementation("com.google.api.grpc:proto-google-cloud-vertexai-v1:1.52.0")
        implementation("com.google.api.grpc:proto-google-common-protos:2.67.0")
        implementation("com.google.api.grpc:proto-google-iam-v1:1.62.0")
        implementation("com.google.auth:google-auth-library-credentials:1.43.0")
        implementation("com.google.auth:google-auth-library-oauth2-http:1.43.0")
        implementation("com.google.http-client:google-http-client:2.1.0")
        implementation("com.google.http-client:google-http-client-gson:2.1.0")
        implementation("com.google.protobuf:protobuf-java:4.33.2")
        implementation("com.google.protobuf:protobuf-java-util:4.33.2")
        implementation("com.google.guava:guava:33.5.0-jre")
        implementation("io.grpc:grpc-api:1.76.3")
        implementation("io.grpc:grpc-context:1.76.3")
        implementation("io.opencensus:opencensus-api:0.31.1")
        implementation("io.opencensus:opencensus-contrib-http-util:0.31.1")
        implementation("org.threeten:threetenbp:1.7.0")
    }

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
    testLogging {
        events("passed", "skipped", "failed")
    }
    jvmArgs("-Xmx1g")
    forkEvery = 12
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
