package com.citi.put.checks.checks.dto;

import java.util.List;

public record FeaturesResponse(List<CheckSourceDto> sources, List<FeatureFlagDto> features) {}
