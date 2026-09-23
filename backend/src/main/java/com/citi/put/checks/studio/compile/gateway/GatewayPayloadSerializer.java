package com.citi.put.checks.studio.compile.gateway;

import java.nio.charset.StandardCharsets;

/**
 * Mechanical, transport-level serialization of a {@link CompileRequest} into what the Vertex SDK
 * sends.
 *
 * <p>Deliberately dumb: it concatenates the parts the caller already produced, in a fixed order,
 * and adds no instructions of its own. Semantic prompt assembly — wording, fencing rules, syntax
 * reference content, credential-pattern rejection — is story 10.8. Keeping it here means the byte
 * accounting in AC-5 measures exactly what leaves the process.
 *
 * <h2>Static first (Story 10.45, FR-11)</h2>
 *
 * <p>The request is split into a {@linkplain #staticPrefix static prefix} (output contract,
 * separator, syntax reference) and the {@linkplain #requestContents per-request contents} (source
 * lines, then the envelope kind and writable step IDs, then any repair diagnostics). The prefix is
 * sent as {@code systemInstruction}. When the EC-17 switch turns {@code systemInstruction} off,
 * {@link #serialize} sends the identical prefix bytes as the leading text of {@code contents[0]},
 * so static-first order holds either way. The prefix is byte-identical for every request that
 * carries the same contract and syntax reference; whether it carries no per-test data depends on
 * those two inputs, which prompt assembly owns.
 */
final class GatewayPayloadSerializer {

  private static final String SEPARATOR = "\n\n";

  private GatewayPayloadSerializer() {}

  /**
   * The static prefix: output contract, separator, syntax reference. Nothing per-request is added
   * here — not the envelope kind, not the writable step IDs.
   *
   * @param request the compile request
   * @return the text sent as {@code systemInstruction}
   */
  static String staticPrefix(CompileRequest request) {
    return request.outputContract() + SEPARATOR + request.syntaxReference();
  }

  /**
   * The per-request contents that follow the static prefix.
   *
   * @param request the compile request
   * @return the text of the single user part when the prefix travels as {@code systemInstruction}
   */
  static String requestContents(CompileRequest request) {
    StringBuilder payload = new StringBuilder();
    for (String line : request.fencedSourceLines()) {
      payload.append(line).append('\n');
    }
    payload.append('\n');
    payload.append("Required envelope kind: ").append(request.proposalKind()).append('\n');
    payload
        .append("Writable step IDs in exact response order: ")
        .append(request.writableStepIds())
        .append('\n');
    // A repair attempt appends the bounded diagnostics of the attempt that just failed, and
    // nothing else (story 10.9, §4.3). Appended last and still mechanically: the document was
    // bounded and redacted by DiagnosticsBounder before it reached this type, so the byte
    // accounting above still measures exactly what leaves the process.
    if (request.repairDiagnostics() != null && !request.repairDiagnostics().isBlank()) {
      payload.append(SEPARATOR).append(request.repairDiagnostics()).append('\n');
    }
    return payload.toString();
  }

  /**
   * The whole request as one text part: the static prefix leading, then the per-request contents.
   * This is the EC-17 fallback shape used when {@code systemInstruction} is switched off.
   *
   * @param request the compile request
   * @return the single-part payload
   */
  static String serialize(CompileRequest request) {
    return staticPrefix(request) + SEPARATOR + requestContents(request);
  }

  static int utf8Size(String value) {
    return value == null ? 0 : value.getBytes(StandardCharsets.UTF_8).length;
  }
}
