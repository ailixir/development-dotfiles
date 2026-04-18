package com.citi.put.checks.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "checks.core-service")
public record CoreServiceProperties(
    String baseUrl,
    Timeout timeout
) {
    public record Timeout(int connectMs, int readMs) {}

    public CoreServiceProperties {
        if (baseUrl == null || baseUrl.isBlank()) baseUrl = "http://localhost:8081";
        if (timeout == null) timeout = new Timeout(2000, 3000);
    }
}
