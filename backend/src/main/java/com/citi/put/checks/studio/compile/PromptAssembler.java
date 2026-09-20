package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.compile.gateway.CompileRequest;
import com.fasterxml.jackson.databind.node.TextNode;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Builds the gateway request from exactly the three &sect;4.3 inputs (Story 10.8, AC-5).
 *
 * <p>The inputs are: the ordered draft source <em>fenced as data</em>, the versioned Playwright
 * syntax reference, and the output/allowed-language contract. Nothing else is added, and in
 * particular <strong>no resolved value is read on the compile path at all</strong>: this class
 * takes the draft's step text and the pinned reference bodies, and has no constructor parameter,
 * field or method through which a secrets service or a vault client could reach it. Secret and
 * variable references travel exactly as the author wrote them, {@code <secret ID>} and {@code <var
 * NAME>}, because the compiler compiles a reference, not a value (&sect;9.2).
 *
 * <h2>Fencing</h2>
 *
 * <p>Each source line is emitted as {@code N: "<JSON string literal>"}. JSON string quoting is the
 * fence: quotes, backslashes, newlines and control characters inside the line are escaped, so a
 * line cannot terminate its own delimiter and cannot introduce a new one. A fence built from a
 * sentinel token ({@code <<<}, {@code ---}) is only a fence until a user pastes the sentinel.
 */
@Component
public class PromptAssembler {

  private final String syntaxReference;
  private final String outputContract;

  public PromptAssembler() {
    this.syntaxReference = readClasspath(CompilePins.SYNTAX_REFERENCE_RESOURCE);
    this.outputContract = readClasspath(CompilePins.OUTPUT_CONTRACT_RESOURCE);
  }

  /**
   * Assembles one compile proposal request.
   *
   * @param testId the draft being compiled
   * @param csiId the owning CSI
   * @param principal the authenticated user that triggered the compile
   * @param compileRequestId the persisted compile request identity from {@code beginCompile}
   * @param attempt 1-based attempt number; this story always issues attempt 1 and never repairs
   * @param orderedSource the draft's steps in author order, with references still opaque
   * @return the transport request 10.5's client accepts
   */
  public CompileRequest assemble(
      UUID testId,
      String csiId,
      String principal,
      UUID compileRequestId,
      int attempt,
      List<String> orderedSource) {
    return new CompileRequest(
        testId,
        csiId,
        principal,
        compileRequestId.toString(),
        attempt,
        fence(orderedSource),
        syntaxReference,
        CompilePins.SYNTAX_REFERENCE_VERSION,
        outputContract,
        CompilePins.PROMPT_VERSION);
  }

  /** Assembles v2 source and untrusted context as one JSON envelope per stable step boundary. */
  public CompileRequest assemble(
      UUID testId,
      String csiId,
      String principal,
      UUID compileRequestId,
      int attempt,
      List<String> orderedSource,
      ContextPromptSection context) {
    return new CompileRequest(
        testId,
        csiId,
        principal,
        compileRequestId.toString(),
        attempt,
        context.fenceWithSource(orderedSource),
        syntaxReference,
        CompilePins.SYNTAX_REFERENCE_VERSION,
        outputContract,
        CompilePins.PROMPT_VERSION);
  }

  /**
   * Fences the ordered source as data.
   *
   * @param orderedSource the draft's steps in author order
   * @return one entry per source line, each an index and a JSON string literal
   */
  public static List<String> fence(List<String> orderedSource) {
    List<String> fenced = new ArrayList<>(orderedSource.size());
    for (int index = 0; index < orderedSource.size(); index++) {
      String line = orderedSource.get(index);
      fenced.add(index + ": " + new TextNode(line == null ? "" : line).toString());
    }
    return List.copyOf(fenced);
  }

  /**
   * The syntax reference body as shipped, for the drift guard.
   *
   * @return the resource contents
   */
  public String syntaxReference() {
    return syntaxReference;
  }

  /**
   * The output contract body as shipped.
   *
   * @return the resource contents
   */
  public String outputContract() {
    return outputContract;
  }

  private static String readClasspath(String resource) {
    try (InputStream in = PromptAssembler.class.getClassLoader().getResourceAsStream(resource)) {
      if (in == null) {
        throw new IllegalStateException(
            "The compile prompt resource " + resource + " is missing from the runtime classpath");
      }
      return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    } catch (IOException e) {
      throw new IllegalStateException("Unable to read the compile prompt resource " + resource, e);
    }
  }
}
