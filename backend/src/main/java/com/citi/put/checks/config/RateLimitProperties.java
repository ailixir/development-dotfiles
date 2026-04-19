package com.citi.put.checks.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "checks.rate-limit")
public record RateLimitProperties(
    @DefaultValue("600") int readPerMin,
    @DefaultValue("120") int writePerMin,
    @DefaultValue("60") int executePerMin,
    @DefaultValue("10") int sendPerMin,
    @DefaultValue("20") int bulkPerMin,
    @DefaultValue("10") int adminMultiplier,
    @DefaultValue("10000") int maxBuckets) {}
