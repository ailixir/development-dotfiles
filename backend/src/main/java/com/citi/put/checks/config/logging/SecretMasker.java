package com.citi.put.checks.config.logging;

import java.util.List;
import java.util.regex.Pattern;

public final class SecretMasker {

  private static final List<Pattern> PATTERNS = List.of(
      Pattern.compile("(?i)(\"password\"\\s*:\\s*\")([^\"]*)(\")"),
      Pattern.compile("(?i)(\"secret\"\\s*:\\s*\")([^\"]*)(\")"),
      Pattern.compile("(?i)(\"token\"\\s*:\\s*\")([^\"]*)(\")"),
      Pattern.compile("(?i)(\"api[_-]?key\"\\s*:\\s*\")([^\"]*)(\")"),
      Pattern.compile("(?i)(\"authorization\"\\s*:\\s*\")([^\"]*)(\")"),
      Pattern.compile("([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\\.[A-Za-z]{2,})")
  );

  private SecretMasker() {}

  public static String mask(String input) {
    if (input == null || input.isEmpty()) {
      return input;
    }
    String result = input;
    for (int i = 0; i < PATTERNS.size(); i++) {
      Pattern p = PATTERNS.get(i);
      if (i < 5) {
        result = p.matcher(result).replaceAll("$1***$3");
      } else {
        result = p.matcher(result).replaceAll("***@$2");
      }
    }
    return result;
  }
}
