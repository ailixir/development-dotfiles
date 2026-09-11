package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayProvenance;
import com.citi.put.checks.studio.compile.gateway.LlmGatewayClient;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

/**
 * A gateway whose answer each test chooses <em>per attempt</em>, recording every request it was
 * handed (Story 10.9, AC-10a).
 *
 * <p>What this stub establishes, and what it does not, is stated plainly because AC-10a's call
 * counts are only ever proven against it: it establishes that <b>the pipeline</b> issues the number
 * of calls the bound allows, numbers them 1, 2, 3 without repeating, carries the previous attempt's
 * bounded diagnostics into each repair, and settles in the state the verdict implies. It
 * establishes <b>nothing</b> about how a real model responds to a repair prompt, whether a repair
 * ever actually fixes an artifact, or whether the R2D2 gateway honours the same request shape —
 * those are AC-10b's, deferred to story 10.19 behind {@code ED-01}, and recorded as skipped rather
 * than passed.
 */
public final class ScriptedRepairGateway implements LlmGatewayClient {

  private final List<com.citi.put.checks.studio.compile.gateway.CompileRequest> seen =
      new CopyOnWriteArrayList<>();
  private final AtomicInteger calls = new AtomicInteger();

  private volatile Function<
          com.citi.put.checks.studio.compile.gateway.CompileRequest, CompileResponse>
      script = request -> ok("{\"version\":1,\"steps\":[]}");

  @Override
  public CompileResponse propose(
      com.citi.put.checks.studio.compile.gateway.CompileRequest request) {
    calls.incrementAndGet();
    seen.add(request);
    return script.apply(request);
  }

  /** Installs the answer function for subsequent calls. */
  public void answer(
      Function<com.citi.put.checks.studio.compile.gateway.CompileRequest, CompileResponse> next) {
    this.script = next;
  }

  /** Clears the recorded calls and restores the default always-valid answer. */
  public void reset(String defaultArtifact) {
    calls.set(0);
    seen.clear();
    this.script = request -> ok(defaultArtifact);
  }

  public int calls() {
    return calls.get();
  }

  /** Every request handed to this stub, in call order. */
  public List<com.citi.put.checks.studio.compile.gateway.CompileRequest> seen() {
    return List.copyOf(seen);
  }

  /** The attempt numbers, in call order. */
  public List<Integer> attempts() {
    return seen.stream()
        .map(com.citi.put.checks.studio.compile.gateway.CompileRequest::attempt)
        .toList();
  }

  public static CompileResponse ok(String artifactJson) {
    return CompileResponse.ok(
        artifactJson,
        new GatewayProvenance("stub-model@1", "001", CompilePins.PROMPT_VERSION, "1.52.0", true, 0),
        0,
        12L,
        100,
        200);
  }
}
