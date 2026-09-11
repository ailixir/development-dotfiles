package com.citi.put.checks.studio.compile.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import com.google.api.gax.grpc.GrpcStatusCode;
import com.google.api.gax.rpc.ApiException;
import com.google.api.gax.rpc.ApiExceptionFactory;
import io.grpc.Status;
import java.io.IOException;
import java.net.ConnectException;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.Test;

/**
 * Story 10.5 AC-4: only definite transport failures may be retried.
 *
 * <p>The negative cases matter more than the positive ones — a retried timeout or a retried
 * ambiguous 5xx doubles the compile cost for the same odds.
 */
class GatewayFailureClassifierTest {

  @Test
  void unavailableAndResourceExhaustedAreRetried() {
    assertThat(GatewayFailureClassifier.isRetryableTransport(apiException(Status.Code.UNAVAILABLE)))
        .isTrue();
    assertThat(
            GatewayFailureClassifier.isRetryableTransport(
                apiException(Status.Code.RESOURCE_EXHAUSTED)))
        .isTrue();
  }

  @Test
  void connectionRefusedAndResetAreRetried() {
    assertThat(
            GatewayFailureClassifier.isRetryableTransport(
                new IOException(new ConnectException("Connection refused"))))
        .isTrue();
    assertThat(
            GatewayFailureClassifier.isRetryableTransport(
                new IOException(new SocketException("Connection reset"))))
        .isTrue();
  }

  @Test
  void timeoutsAreNeverRetried() {
    assertThat(
            GatewayFailureClassifier.isRetryableTransport(
                new IOException(new SocketTimeoutException("Read timed out"))))
        .isFalse();
    assertThat(GatewayFailureClassifier.isRetryableTransport(new TimeoutException("deadline")))
        .isFalse();
    assertThat(
            GatewayFailureClassifier.isRetryableTransport(
                apiException(Status.Code.DEADLINE_EXCEEDED)))
        .isFalse();
  }

  @Test
  void ambiguousServerErrorsAreNotRetried() {
    assertThat(GatewayFailureClassifier.isRetryableTransport(apiException(Status.Code.INTERNAL)))
        .isFalse();
    assertThat(GatewayFailureClassifier.isRetryableTransport(apiException(Status.Code.UNKNOWN)))
        .isFalse();
    assertThat(
            GatewayFailureClassifier.isRetryableTransport(
                apiException(Status.Code.INVALID_ARGUMENT)))
        .isFalse();
    assertThat(GatewayFailureClassifier.isRetryableTransport(new IllegalStateException("boom")))
        .isFalse();
    assertThat(GatewayFailureClassifier.isRetryableTransport(null)).isFalse();
  }

  @Test
  void outcomeAndErrorCodeFollowTheClassification() {
    assertThat(GatewayFailureClassifier.outcomeFor(new SocketTimeoutException("Read timed out")))
        .isEqualTo(GatewayOutcome.TIMEOUT);
    assertThat(GatewayFailureClassifier.outcomeFor(apiException(Status.Code.UNAVAILABLE)))
        .isEqualTo(GatewayOutcome.TRANSPORT);
    assertThat(GatewayFailureClassifier.errorCodeFor(GatewayOutcome.TIMEOUT))
        .isEqualTo(GatewayErrorCode.GATEWAY_TIMEOUT);
    assertThat(GatewayFailureClassifier.errorCodeFor(GatewayOutcome.TRANSPORT))
        .isEqualTo(GatewayErrorCode.GATEWAY_TRANSPORT);
  }

  private static ApiException apiException(Status.Code code) {
    return ApiExceptionFactory.createException(
        new IllegalStateException("stub"), GrpcStatusCode.of(code), false);
  }
}
