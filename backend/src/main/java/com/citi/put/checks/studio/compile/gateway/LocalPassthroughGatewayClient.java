package com.citi.put.checks.studio.compile.gateway;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * The {@code local}-profile stand-in for the LLM gateway (Studio v1 WP2).
 *
 * <p>A laptop holds no R2D2 credentials, and with the gateway disabled no draft can ever be
 * compiled, confirmed and therefore run — so the local e2e path would stop at the compile button.
 * This client does <b>not</b> translate English: it accepts a draft whose every step is already a
 * Playwright statement ({@code await page.goto('http://127.0.0.1:5173/');}) and proposes each step
 * verbatim as that step's code. Everything after the proposal is the real path: the runner's
 * default-deny validator at {@code POST /v1/validate}, the exact confirmation, the readiness
 * predicate, the dispatcher, the runner and its reports.
 *
 * <p>A step that does not start with {@code await } is refused without a proposal: the draft
 * settles with {@code GATEWAY_UNAVAILABLE} exactly as it does with the gateway off, and the reason
 * naming the step is logged at WARN as {@code studio.gateway.failure}. Nothing is sent to the
 * validator for it.
 *
 * <p>Selected only when {@code studio.compile.gateway.enabled=false} <em>and</em> {@code
 * studio.compile.gateway.local-passthrough=true}, and {@link StudioGatewayConfig} refuses to start
 * with it outside the {@code local} profile. It opens no socket.
 */
public class LocalPassthroughGatewayClient implements LlmGatewayClient {

  /** Recorded as the model in provenance, so a revision it produced is identifiable as such. */
  public static final String MODEL = "local-passthrough";

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final GatewayAuditLogger auditLogger;

  public LocalPassthroughGatewayClient(GatewayAuditLogger auditLogger) {
    this.auditLogger = auditLogger;
  }

  @Override
  public CompileResponse propose(CompileRequest request) {
    CompileResponse response = answer(request);
    auditLogger.audit(request, MODEL, response);
    if (!response.isOk()) {
      auditLogger.diagnostic(request, response.outcome(), response.failureReason());
    }
    return response;
  }

  private static CompileResponse answer(CompileRequest request) {
    GatewayProvenance provenance =
        new GatewayProvenance(MODEL, null, request.promptVersion(), "none", false, 0d);
    List<String> lines;
    try {
      lines = unfence(request.fencedSourceLines());
    } catch (IOException | IllegalArgumentException e) {
      return refuse("the draft source could not be read back from its fence", provenance);
    }
    ObjectNode artifact = MAPPER.createObjectNode();
    artifact.put("version", 1);
    ArrayNode steps = artifact.putArray("steps");
    for (int index = 0; index < lines.size(); index++) {
      String line = lines.get(index).strip();
      if (!line.startsWith("await ")) {
        return refuse(
            "local passthrough gateway: step "
                + (index + 1)
                + " is not a Playwright statement. Locally, write each step as Playwright code"
                + " (e.g. await page.goto('http://127.0.0.1:5173/');) or enable the real gateway"
                + " (STUDIO_GATEWAY_ENABLED=true).",
            provenance);
      }
      steps
          .addObject()
          .put("stepIndex", index)
          .put("originalText", lines.get(index))
          .put("code", line);
    }
    String json = artifact.toString();
    int inputBytes =
        String.join("\n", request.fencedSourceLines()).getBytes(StandardCharsets.UTF_8).length;
    return CompileResponse.ok(
        json, provenance, 0, 0L, inputBytes, json.getBytes(StandardCharsets.UTF_8).length);
  }

  /** Reverses {@code PromptAssembler.fence}: {@code "<index>: <JSON string literal>"}. */
  static List<String> unfence(List<String> fenced) throws IOException {
    List<String> lines = new ArrayList<>(fenced.size());
    for (String entry : fenced) {
      int separator = entry.indexOf(": ");
      if (separator < 0) {
        throw new IllegalArgumentException("not a fenced line");
      }
      JsonNode literal = MAPPER.readTree(entry.substring(separator + 2));
      if (!literal.isTextual()) {
        throw new IllegalArgumentException("not a fenced line");
      }
      lines.add(literal.asText());
    }
    return lines;
  }

  private static CompileResponse refuse(String reason, GatewayProvenance provenance) {
    return CompileResponse.failure(
        GatewayOutcome.DISABLED,
        GatewayErrorCode.GATEWAY_UNAVAILABLE,
        reason,
        provenance,
        0,
        0L,
        0,
        0);
  }
}
