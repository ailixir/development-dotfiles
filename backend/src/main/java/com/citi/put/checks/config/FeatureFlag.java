package com.citi.put.checks.config;

public enum FeatureFlag {
  SCHEDULING("Schedule Management"),
  REPORTS("Reports & Analytics"),
  BULK_OPERATIONS("Bulk Operations"),
  TEMPLATES("Check Templates"),
  STUDIO("Checks Studio"),
  DASHBOARD("Dashboard");

  private final String label;

  FeatureFlag(String label) {
    this.label = label;
  }

  public String label() {
    return label;
  }
}
