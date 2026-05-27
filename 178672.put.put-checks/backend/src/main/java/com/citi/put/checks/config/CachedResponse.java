package com.citi.put.checks.config;

import java.util.List;
import java.util.Map;

public record CachedResponse(int status, Map<String, List<String>> headers, byte[] body) {}
