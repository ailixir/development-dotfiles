package com.citi.put.checks.dc;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Internal DC bridge response. Outer envelope assumes status + comment (Proposal B). Must not leak
 * outside {@code com.citi.put.checks.dc}.
 */
public record DcResponse(
    int httpStatus, String status, String comment, String deepLink, JsonNode rawBody) {}
