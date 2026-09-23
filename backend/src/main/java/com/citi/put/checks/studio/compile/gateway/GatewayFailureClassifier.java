package com.citi.put.checks.studio.compile.gateway;

import com.google.genai.errors.ApiException;
import java.io.InterruptedIOException;
import java.net.ConnectException;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.util.Locale;
import java.util.concurrent.TimeoutException;

/**
 * Decides whether a failure may be retried and which audit outcome it maps to (Story 10.5, AC-4).
 *
 * <p>Only definite transport failures are retryable. A timeout is never retried: the request may
 * already have been executed and billed, and &sect;4.3 caps total compile work. Ambiguous 5xx —
 * anything the gateway answered with after it started producing a response — is likewise not
 * retried, because a repeat would double the cost without changing the odds.
 */
final class GatewayFailureClassifier {

  private GatewayFailureClassifier() {}

  /**
   * @param throwable the failure raised by the SDK
   * @return true only for connection refused/reset, HTTP 429 and HTTP 503
   */
  static boolean isRetryableTransport(Throwable throwable) {
    if (isTimeout(throwable)) {
      return false;
    }
    for (Throwable current = throwable; current != null; current = current.getCause()) {
      if (current instanceof ApiException apiException) {
        return apiException.code() == 429 || apiException.code() == 503;
      }
      if (current instanceof ConnectException) {
        return true;
      }
      if (current instanceof SocketException socketException && isReset(socketException)) {
        return true;
      }
    }
    return false;
  }

  /**
   * @param throwable the failure raised by the SDK
   * @return {@link GatewayOutcome#TIMEOUT} when the deadline elapsed, otherwise {@link
   *     GatewayOutcome#TRANSPORT}
   */
  static GatewayOutcome outcomeFor(Throwable throwable) {
    return isTimeout(throwable) ? GatewayOutcome.TIMEOUT : GatewayOutcome.TRANSPORT;
  }

  /**
   * @param outcome a failure outcome
   * @return the caller-facing code for that outcome
   */
  static GatewayErrorCode errorCodeFor(GatewayOutcome outcome) {
    return outcome == GatewayOutcome.TIMEOUT
        ? GatewayErrorCode.GATEWAY_TIMEOUT
        : GatewayErrorCode.GATEWAY_TRANSPORT;
  }

  private static boolean isTimeout(Throwable throwable) {
    for (Throwable current = throwable; current != null; current = current.getCause()) {
      if (current instanceof SocketTimeoutException
          || current instanceof TimeoutException
          || (current instanceof InterruptedIOException
              && "timeout".equalsIgnoreCase(current.getMessage()))) {
        return true;
      }
      if (current instanceof ApiException apiException && apiException.code() == 504) {
        return true;
      }
      String message = current.getMessage();
      if (message != null && message.toLowerCase(Locale.ROOT).contains("timed out")) {
        return true;
      }
    }
    return false;
  }

  private static boolean isReset(SocketException exception) {
    String message = exception.getMessage();
    return message != null && message.toLowerCase(Locale.ROOT).contains("reset");
  }
}
