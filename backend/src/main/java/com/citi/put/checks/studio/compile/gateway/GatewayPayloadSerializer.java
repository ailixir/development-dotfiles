package com.citi.put.checks.studio.compile.gateway;

import java.nio.charset.StandardCharsets;

/**
 * Mechanical, transport-level serialization of a {@link CompileRequest} into the single text part
 * the Vertex SDK sends.
 *
 * <p>Deliberately dumb: it concatenates the parts the caller already produced, in a fixed order,
 * and adds no instructions of its own. Semantic prompt assembly — wording, fencing rules, syntax
 * reference content, credential-pattern rejection — is story 10.8. Keeping it here means the byte
 * accounting in AC-5 measures exactly what leaves the process.
 */
final class GatewayPayloadSerializer {

  private static final String SEPARATOR = "\n\n";

  private GatewayPayloadSerializer() {}

  static String serialize(CompileRequest request) {
    StringBuilder payload = new StringBuilder();
    payload.append(request.outputContract()).append(SEPARATOR);
    payload.append("Required envelope kind: ").append(request.proposalKind()).append('\n');
    payload
        .append("Writable step IDs in exact response order: ")
        .append(request.writableStepIds())
        .append(SEPARATOR);
    payload.append(request.syntaxReference()).append(SEPARATOR);
    for (String line : request.fencedSourceLines()) {
      payload.append(line).append('\n');
    }
    // A repair attempt appends the bounded diagnostics of the attempt that just failed, and
    // nothing else (story 10.9, §4.3). Appended last and still mechanically: the document was
    // bounded and redacted by DiagnosticsBounder before it reached this type, so the byte
    // accounting above still measures exactly what leaves the process.
    if (request.repairDiagnostics() != null && !request.repairDiagnostics().isBlank()) {
      payload.append(SEPARATOR).append(request.repairDiagnostics()).append('\n');
    }
    return payload.toString();
  }

  static int utf8Size(String value) {
    return value == null ? 0 : value.getBytes(StandardCharsets.UTF_8).length;
  }
}
