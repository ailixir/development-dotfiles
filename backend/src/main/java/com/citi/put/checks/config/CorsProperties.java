package com.citi.put.checks.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "checks.cors")
public record CorsProperties(
    List<String> allowedOrigins
) {
    public CorsProperties {
        if (allowedOrigins == null) allowedOrigins = List.of("http://localhost:3000", "http://localhost:5173");
    }
}
