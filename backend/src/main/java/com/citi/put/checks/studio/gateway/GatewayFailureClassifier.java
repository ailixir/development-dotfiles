package com.citi.put.checks.studio.gateway;

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
 * <p>Only definite transport failures are retryable. A timeout is never retried here: the request
 * may already have been executed and billed, and the caller's budget caps total work. The one
 * exception sits outside this class: the guided coordinator may repeat a pre-response stall (the
 * per-send cap expired before any response headers) as a new, fully charged attempt; that decision
 * uses the transport's closed {@code responseStarted} flag, and this classifier is unchanged.
 * Ambiguous 5xx — anything the gateway answered with after it started producing a response — is
 * likewise not retried, because a repeat would double the cost without changing the odds.
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
    return switch (transportFailureFor(throwable)) {
      case CONNECT, HTTP_429, HTTP_503 -> true;
      default -> false;
    };
  }

  /**
   * Buckets a non-timeout transport failure into a closed class. Reads only the integer {@code
   * ApiException.code()} and exception types; no message, body or header leaves this method except
   * the existing reset check on a socket exception.
   *
   * @param throwable the failure raised by the SDK
   * @return the first matching class on the cause chain, otherwise {@code OTHER}
   */
  static GenAiGatewayTransport.TransportFailure transportFailureFor(Throwable throwable) {
    for (Throwable current = throwable; current != null; current = current.getCause()) {
      if (current instanceof ApiException apiException) {
        int code = apiException.code();
        if (code == 429) {
          return GenAiGatewayTransport.TransportFailure.HTTP_429;
        }
        if (code == 503) {
          return GenAiGatewayTransport.TransportFailure.HTTP_503;
        }
        if (code == 400) {
          return GenAiGatewayTransport.TransportFailure.HTTP_400;
        }
        if (code == 401 || code == 403) {
          return GenAiGatewayTransport.TransportFailure.HTTP_401_403;
        }
        if (code >= 400 && code < 500) {
          return GenAiGatewayTransport.TransportFailure.HTTP_4XX;
        }
        if (code >= 500 && code < 600) {
          return GenAiGatewayTransport.TransportFailure.HTTP_5XX;
        }
        return GenAiGatewayTransport.TransportFailure.OTHER;
      }
      if (current instanceof ConnectException) {
        return GenAiGatewayTransport.TransportFailure.CONNECT;
      }
      if (current instanceof SocketException socketException && isReset(socketException)) {
        return GenAiGatewayTransport.TransportFailure.CONNECT;
      }
    }
    return GenAiGatewayTransport.TransportFailure.OTHER;
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
