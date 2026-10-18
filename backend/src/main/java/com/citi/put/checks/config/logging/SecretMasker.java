package com.citi.put.checks.config.logging;

import java.util.List;
import java.util.regex.Pattern;

public final class SecretMasker {

  private static final List<Pattern> PATTERNS =
      List.of(
          Pattern.compile("(?i)(\"password\"\\s*:\\s*\")([^\"]*)(\")"),
          Pattern.compile("(?i)(\"secret\"\\s*:\\s*\")([^\"]*)(\")"),
          Pattern.compile("(?i)(\"token\"\\s*:\\s*\")([^\"]*)(\")"),
          Pattern.compile("(?i)(\"api[_-]?key\"\\s*:\\s*\")([^\"]*)(\")"),
          Pattern.compile("(?i)(\"authorization\"\\s*:\\s*\")([^\"]*)(\")"),
          // Linear-time form of ([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,}) with identical
          // matches. The original retried every start inside a long local-part run, which is
          // quadratic (64,000 chars took about 18 s). A local part always runs to the end of
          // its run, so every start inside a run gives the same result. Only the start of a run
          // is tried (lookbehind), plus the position where the previous match ended (\G): in
          // "x@a.bc1@e.fg" the second address starts mid-run, right after the first match.
          // The possessive ++ is safe because '@' is outside the local-part class.
          Pattern.compile(
              "(?:\\G|(?<![A-Za-z0-9._%+-]))([A-Za-z0-9._%+-]++)@([A-Za-z0-9.-]+\\.[A-Za-z]{2,})"));

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
