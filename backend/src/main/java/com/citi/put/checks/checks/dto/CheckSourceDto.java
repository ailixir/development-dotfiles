package com.citi.put.checks.checks.dto;

import com.citi.put.checks.checks.model.CheckType;

public record CheckSourceDto(String type, boolean enabled, String label) {

  private static final java.util.Map<CheckType, String> LABELS =
      java.util.Map.of(
          CheckType.HTTP, "HTTP/HTTPS Check",
          CheckType.TCP, "TCP Port Check",
          CheckType.SPLUNK, "Splunk Query",
          CheckType.GRAFANA, "Grafana Metrics",
          CheckType.ITRS, "ITRS Geneos",
          CheckType.APPDYNAMICS, "AppDynamics APM",
          CheckType.UI_TEST, "UI Test (Checks Studio)");

  public static CheckSourceDto of(CheckType type, boolean enabled) {
    return new CheckSourceDto(type.name(), enabled, LABELS.getOrDefault(type, type.name()));
  }
}
