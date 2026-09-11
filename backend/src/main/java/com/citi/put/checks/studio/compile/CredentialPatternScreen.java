package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.StudioValidationException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Rejects known credential patterns before gateway submission (Story 10.8, AC-7; architecture
 * &sect;4.3).
 *
 * <h2>What this is not</h2>
 *
 * <p>Pattern checks cannot detect every pasted secret and must not be described as a proof that
 * arbitrary text is secret-free. This class recognises a fixed list of well-known credential
 * shapes. A password that looks like an ordinary word will pass it, and that is not a defect to be
 * fixed by adding heuristics — it is the reason the vault reference syntax exists. Every message
 * this class produces says so, and {@code CredentialScreenHonestyTest} fails the build if any
 * message in the module starts claiming otherwise.
 *
 * <p>The rejection names the pattern class and the step index and <em>never</em> echoes the matched
 * text: a diagnostic that quotes the secret it found has moved the secret into a log line, which is
 * exactly the outcome the screen exists to prevent.
 */
@Component
public class CredentialPatternScreen {

  /** Code returned to the client for a rejected draft. */
  public static final String INLINE_CREDENTIAL = "INLINE_CREDENTIAL";

  /**
   * The limitation, in the source's own terms. Reproduced verbatim in the user-facing message, in
   * this javadoc and in the module README so the three cannot disagree.
   */
  public static final String LIMITATION =
      "Pattern checks cannot detect every pasted secret and must not be described as a proof that"
          + " arbitrary text is secret-free.";

  private static final String GUIDANCE =
      "Replace the value with a vault reference — <secret ID> for a secret, <var NAME> for a"
          + " variable — and declare it on the test. "
          + LIMITATION;

  private static final Map<String, Pattern> PATTERNS = patterns();

  /**
   * Rejects a draft whose source matches a known credential pattern.
   *
   * @param orderedSource the draft's steps in author order
   * @throws StudioValidationException {@code INLINE_CREDENTIAL}, naming the pattern class and the
   *     1-based step number, never the matched text
   */
  public void requireNoInlineCredentials(List<String> orderedSource) {
    List<String> source = orderedSource == null ? List.of() : orderedSource;
    for (int index = 0; index < source.size(); index++) {
      String line = source.get(index);
      if (line == null || line.isEmpty()) {
        continue;
      }
      for (Map.Entry<String, Pattern> entry : PATTERNS.entrySet()) {
        if (entry.getValue().matcher(line).find()) {
          throw new StudioValidationException(
              INLINE_CREDENTIAL,
              "Step "
                  + (index + 1)
                  + " looks like it contains an inline credential ("
                  + entry.getKey()
                  + "). "
                  + GUIDANCE);
        }
      }
    }
  }

  /**
   * The pattern classes this screen recognises, in the order they are tried.
   *
   * @return an unmodifiable view, for the README and for tests that enumerate coverage
   */
  public static Map<String, Pattern> patternClasses() {
    return PATTERNS;
  }

  private static Map<String, Pattern> patterns() {
    Map<String, Pattern> known = new LinkedHashMap<>();
    known.put("PRIVATE_KEY_BLOCK", Pattern.compile("-----BEGIN [A-Z ]*PRIVATE KEY-----"));
    known.put("AWS_ACCESS_KEY_ID", Pattern.compile("\\b(?:AKIA|ASIA|AGPA|AIDA)[0-9A-Z]{16}\\b"));
    known.put("GOOGLE_API_KEY", Pattern.compile("\\bAIza[0-9A-Za-z_\\-]{35}\\b"));
    known.put("GITHUB_TOKEN", Pattern.compile("\\bgh[pousr]_[A-Za-z0-9]{36,}\\b"));
    known.put("SLACK_TOKEN", Pattern.compile("\\bxox[abprs]-[A-Za-z0-9\\-]{10,}\\b"));
    known.put(
        "JSON_WEB_TOKEN",
        Pattern.compile("\\beyJ[A-Za-z0-9_\\-]{8,}\\.[A-Za-z0-9_\\-]{8,}\\.[A-Za-z0-9_\\-]{8,}"));
    known.put("BASIC_AUTH_IN_URL", Pattern.compile("://[^/\\s:@]+:[^/\\s:@]+@"));
    // A literal assignment: `password=hunter2`, `api_key: abc`. Deliberately requires the operator,
    // so an ordinary instruction that merely names the "Password" field is not a false positive.
    known.put(
        "CREDENTIAL_ASSIGNMENT",
        Pattern.compile(
            "(?i)\\b(?:password|passwd|pwd|secret|api[_\\-]?key|apikey|access[_\\-]?token"
                + "|auth[_\\-]?token|client[_\\-]?secret)\\s*[:=]\\s*[^\\s\"'<]+"));
    return Collections.unmodifiableMap(known);
  }
}
