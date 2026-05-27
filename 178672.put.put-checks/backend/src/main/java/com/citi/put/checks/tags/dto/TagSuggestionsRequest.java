package com.citi.put.checks.tags.dto;

import java.util.List;

public record TagSuggestionsRequest(List<String> selectedTags, String csiId) {}
