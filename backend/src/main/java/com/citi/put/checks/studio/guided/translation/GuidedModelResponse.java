package com.citi.put.checks.studio.guided.translation;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Objects;

/**
 * Safe provider result: no raw response or exception text may be retained. {@code reason} is a
 * closed token (never prose) naming why a non-OK result was rejected; it is always present for a
 * non-OK code and always absent for OK.
 */
public record GuidedModelResponse(
    Code code,
    JsonNode proposal,
    Integer inputTokens,
    Integer outputTokens,
    String providerModel,
    Reason reason) {
  public enum Code {
    OK,
    INVALID_RESPONSE,
    TOO_LARGE,
    BUSY,
    TIMEOUT,
    TRANSPORT,
    DISABLED
  }

  /**
   * Closed persisted rejection vocabulary for provider results (translation-design section 5).
   * {@code definiteTransient} is true for the four classes a read-only proposal may safely repeat
   * as a new charged attempt: connection refused/reset, HTTP 429, HTTP 503 and a pre-response
   * stall. A stall may double a billed provider computation, which the ledger charges at full
   * ceiling.
   */
  public enum Reason {
    INVALID_RESPONSE(Code.INVALID_RESPONSE, false),
    TOO_LARGE(Code.TOO_LARGE, false),
    BUSY(Code.BUSY, false),
    TIMEOUT(Code.TIMEOUT, false),
    DISABLED(Code.DISABLED, false),
    TRANSPORT_CREDENTIAL(Code.TRANSPORT, false),
    TRANSPORT_USAGE(Code.TRANSPORT, false),
    TRANSPORT_CONNECT(Code.TRANSPORT, true),
    TRANSPORT_HTTP_429(Code.TRANSPORT, true),
    TRANSPORT_HTTP_503(Code.TRANSPORT, true),
    TRANSPORT_HTTP_400(Code.TRANSPORT, false),
    TRANSPORT_HTTP_401_403(Code.TRANSPORT, false),
    TRANSPORT_HTTP_4XX(Code.TRANSPORT, false),
    TRANSPORT_HTTP_5XX(Code.TRANSPORT, false),
    TRANSPORT_OTHER(Code.TRANSPORT, false),
    TRANSPORT_ADAPTER_FAULT(Code.TRANSPORT, false),
    /**
     * The per-send cap expired with no response headers while the cap, not the call budget, was the
     * binding limit.
     */
    TRANSPORT_STALL(Code.TRANSPORT, true);

    private final Code code;
    private final boolean definiteTransient;

    Reason(Code code, boolean definiteTransient) {
      this.code = code;
      this.definiteTransient = definiteTransient;
    }

    public Code code() {
      return code;
    }

    public boolean definiteTransient() {
      return definiteTransient;
    }

    static Reason defaultFor(Code code) {
      return switch (code) {
        case OK -> null;
        case INVALID_RESPONSE -> INVALID_RESPONSE;
        case TOO_LARGE -> TOO_LARGE;
        case BUSY -> BUSY;
        case TIMEOUT -> TIMEOUT;
        case DISABLED -> DISABLED;
        case TRANSPORT -> TRANSPORT_OTHER;
      };
    }
  }

  public GuidedModelResponse {
    Objects.requireNonNull(code);
    if ((code == Code.OK) != (proposal != null)
        || inputTokens != null && inputTokens < 0
        || outputTokens != null && outputTokens < 0) {
      throw new IllegalArgumentException("Invalid guided response");
    }
    // A caller that names no reason gets the code's own token (TRANSPORT becomes TRANSPORT_OTHER).
    reason = reason == null ? Reason.defaultFor(code) : reason;
    if (reason != null && reason.code() != code) {
      throw new IllegalArgumentException("Invalid guided response");
    }
    proposal = proposal == null ? null : proposal.deepCopy();
  }

  public GuidedModelResponse(
      Code code,
      JsonNode proposal,
      Integer inputTokens,
      Integer outputTokens,
      String providerModel) {
    this(code, proposal, inputTokens, outputTokens, providerModel, null);
  }

  @Override
  public JsonNode proposal() {
    return proposal == null ? null : proposal.deepCopy();
  }
}
