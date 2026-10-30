package com.citi.put.checks.studio.support;

import com.citi.put.checks.studio.navigation.AllowedDomains;
import java.util.List;

/**
 * The allowed domains the fixtures' pages live on (STUDIO-FLEX-001). {@code .test}, {@code
 * .example}, {@code .invalid}, {@code example.com} and {@code localhost} cover every host the
 * fixtures name; a host a test wants refused is simply not under one of them.
 */
public final class TestDomains {
  public static final List<String> ENTRIES =
      List.of(
          "test", "example", "invalid", "example.com", "localhost", "practicetestautomation.com");
  public static final AllowedDomains FIXTURES = new AllowedDomains(ENTRIES);

  private TestDomains() {}
}
