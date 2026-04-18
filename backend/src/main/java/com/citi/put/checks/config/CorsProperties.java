package com.citi.put.checks.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "checks.cors")
public record CorsProperties(
    @DefaultValue({"http://localhost:3000", "http://localhost:5173"})
        List<String> allowedOrigins) {}
