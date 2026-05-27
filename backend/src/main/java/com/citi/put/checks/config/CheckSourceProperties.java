package com.citi.put.checks.config;

import com.citi.put.checks.checks.model.CheckType;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "checks")
public record CheckSourceProperties(@DefaultValue Map<CheckType, Boolean> sources) {

  public CheckSourceProperties {
    EnumMap<CheckType, Boolean> merged = new EnumMap<>(CheckType.class);
    for (CheckType t : CheckType.values()) {
      merged.put(t, true);
    }
    if (sources != null) {
      merged.putAll(sources);
    }
    sources = Map.copyOf(merged);
  }

  public boolean isEnabled(CheckType type) {
    return Boolean.TRUE.equals(sources.get(type));
  }

  public List<CheckType> enabledTypes() {
    return sources.entrySet().stream()
        .filter(Map.Entry::getValue)
        .map(Map.Entry::getKey)
        .collect(Collectors.toList());
  }

  public List<String> enabledTypeNames() {
    return enabledTypes().stream().map(Enum::name).collect(Collectors.toList());
  }
}
