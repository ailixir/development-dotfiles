package com.citi.put.checks.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

class AntiRegressionTest {

    private static final List<String> FORBIDDEN_CONFIG_KEYS = List.of(
        "spring.security.oauth2.resourceserver.jwt.issuer-uri",
        "CHECKS_OIDC_ISSUER"
    );

    @Test
    void noForbiddenConfigKeysInApplicationYml() throws IOException {
        Path resourcesDir = Path.of("src/main/resources");
        if (!Files.exists(resourcesDir)) return;

        List<Path> configFiles = Files.walk(resourcesDir)
            .filter(p -> p.getFileName().toString().startsWith("application"))
            .filter(p -> {
                String name = p.getFileName().toString();
                return name.endsWith(".yml") || name.endsWith(".yaml") || name.endsWith(".properties");
            })
            .toList();

        for (Path configFile : configFiles) {
            String content = Files.readString(configFile);
            for (String key : FORBIDDEN_CONFIG_KEYS) {
                assertThat(content)
                    .as("DEBT-04: Config file %s must not contain '%s'", configFile.getFileName(), key)
                    .doesNotContain(key);
            }
        }
    }

    @Test
    void noOauth2ResourceServerInBuildFile() throws IOException {
        Path buildFile = Path.of("build.gradle.kts");
        if (!Files.exists(buildFile)) return;

        String content = Files.readString(buildFile);
        assertThat(content)
            .as("DEBT-04: build.gradle.kts must not declare spring-boot-starter-oauth2-resource-server")
            .doesNotContain("oauth2-resource-server");
    }
}
