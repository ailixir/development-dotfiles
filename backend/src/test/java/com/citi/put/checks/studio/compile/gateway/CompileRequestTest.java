package com.citi.put.checks.studio.compile.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Story 10.5 AC-1: the request type is an immutable carrier of opaque tokens plus metadata. */
class CompileRequestTest {

  @Test
  void sourceLinesAreDefensivelyCopied() {
    List<String> mutable = new ArrayList<>(List.of("1. Go to \"https://example.invalid\""));
    CompileRequest request = GatewayTestSupport.request(mutable);

    mutable.add("2. injected after construction");

    assertThat(request.fencedSourceLines()).hasSize(1);
    assertThatThrownBy(() -> request.fencedSourceLines().add("3. injected through the getter"))
        .isInstanceOf(UnsupportedOperationException.class);
  }

  @Test
  void attemptMustBeOneBased() {
    assertThatThrownBy(
            () ->
                new CompileRequest(
                    java.util.UUID.randomUUID(),
                    "CSI1",
                    "p",
                    "cr",
                    0,
                    List.of("1. x"),
                    "ref",
                    "v1",
                    "contract",
                    "prompt-v1"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("attempt must be >= 1");
  }

  @Test
  void metadataIsRequired() {
    assertThatThrownBy(
            () ->
                new CompileRequest(
                    null, "CSI1", "p", "cr", 1, List.of(), "ref", "v1", "contract", "prompt-v1"))
        .isInstanceOf(NullPointerException.class)
        .hasMessage("testId");
  }
}
