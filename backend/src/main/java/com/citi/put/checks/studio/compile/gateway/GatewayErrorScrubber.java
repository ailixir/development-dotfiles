package com.citi.put.checks.studio.compile.gateway;

import com.citi.put.checks.config.logging.SecretMasker;
import com.google.genai.errors.ApiException;

/**
 * Turns a gateway failure into a short reason that is safe to return and to log (Story 10.5,
 * AC-11).
 *
 * <p>Gateway error bodies can echo the request back. Masking alone would not stop that, so any
 * fragment of the request's own source lines is redacted before truncation, on top of the shared
 * {@link SecretMasker} patterns.
 */
final class GatewayErrorScrubber {

  private static final int MAX_MESSAGE_LENGTH = 200;
  private static final String REDACTED = "[REDACTED]";
  private static final int MIN_REDACTABLE_FRAGMENT = 8;

  private GatewayErrorScrubber() {}

  /**
   * @param throwable the SDK or transport failure
   * @param request the request whose content must not appear in the result
   * @return exception type, gateway status code when known, and a scrubbed truncated message
   */
  static String scrub(Throwable throwable, CompileRequest request) {
    if (throwable == null) {
      return "unknown failure";
    }
    StringBuilder reason = new StringBuilder(throwable.getClass().getSimpleName());
    if (throwable instanceof ApiException apiException) {
      reason.append(" (status=").append(apiException.code()).append(')');
    }
    String message = scrubText(throwable.getMessage(), request);
    if (!message.isEmpty()) {
      reason.append(": ").append(message);
    }
    return reason.toString();
  }

  /**
   * @param text arbitrary text that may have come back from the gateway
   * @param request the request whose content must not appear in the result
   * @return the text with request content and known secret patterns removed, truncated
   */
  static String scrubText(String text, CompileRequest request) {
    if (text == null || text.isBlank()) {
      return "";
    }
    String scrubbed = text.replaceAll("\\s+", " ").strip();
    if (request != null) {
      for (String line : request.fencedSourceLines()) {
        scrubbed = redactFragment(scrubbed, line);
      }
      scrubbed = redactFragment(scrubbed, request.outputContract());
      scrubbed = redactFragment(scrubbed, request.syntaxReference());
      // A repair prompt carries the previous attempt's diagnostics, so a gateway that echoes the
      // request back can echo those too. They are bounded and redacted already, but they are still
      // request content and this method's contract is that no request content survives it.
      scrubbed = redactFragment(scrubbed, request.repairDiagnostics());
    }
    scrubbed = SecretMasker.mask(scrubbed);
    return scrubbed.length() <= MAX_MESSAGE_LENGTH
        ? scrubbed
        : scrubbed.substring(0, MAX_MESSAGE_LENGTH) + "...";
  }

  private static String redactFragment(String text, String fragment) {
    if (fragment == null) {
      return text;
    }
    String normalized = fragment.replaceAll("\\s+", " ").strip();
    if (normalized.length() < MIN_REDACTABLE_FRAGMENT) {
      return text;
    }
    return text.replace(normalized, REDACTED);
  }
}
