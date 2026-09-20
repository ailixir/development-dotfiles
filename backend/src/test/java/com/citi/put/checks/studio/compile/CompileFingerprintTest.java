package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.readiness.RuntimePinProperties;
import org.junit.jupiter.api.Test;

class CompileFingerprintTest {
  @Test
  void settingsAndEveryRuntimePinAreIncludedInTheCanonicalFingerprint() {
    var baseline = new RuntimePinProperties(1, "2.0.0", "2.0.0", "2.0.0", "1.63.0");
    String first =
        CompilePipeline.compilationFingerprint(
            "{\"model\":\"pinned\",\"temperature\":0}", baseline);
    assertThat(
            CompilePipeline.compilationFingerprint(
                "{\"temperature\":0,\"model\":\"pinned\"}", baseline))
        .isEqualTo(first);
    assertThat(
            CompilePipeline.compilationFingerprint(
                "{\"model\":\"other\",\"temperature\":0}", baseline))
        .isNotEqualTo(first);
    assertThat(
            CompilePipeline.compilationFingerprint(
                "{\"model\":\"pinned\",\"temperature\":0}",
                new RuntimePinProperties(1, "3.0.0", "2.0.0", "2.0.0", "1.63.0")))
        .isNotEqualTo(first);
    assertThat(
            CompilePipeline.compilationFingerprint(
                "{\"model\":\"pinned\",\"temperature\":0}",
                new RuntimePinProperties(1, "2.0.0", "2.0.0", "3.0.0", "1.63.0")))
        .isNotEqualTo(first);
    assertThat(
            CompilePipeline.compilationFingerprint(
                "{\"model\":\"pinned\",\"temperature\":0}",
                new RuntimePinProperties(1, "2.0.0", "2.0.0", "2.0.0", "1.64.0")))
        .isNotEqualTo(first);
    assertThat(
            CompilePipeline.compilationFingerprint(
                "{\"model\":\"pinned\",\"temperature\":0}",
                new RuntimePinProperties(2, "2.0.0", "2.0.0", "2.0.0", "1.63.0")))
        .isNotEqualTo(first);
    assertThat(
            CompilePipeline.compilationFingerprint(
                "{\"model\":\"pinned\",\"temperature\":0}",
                new RuntimePinProperties(1, "2.0.0", "3.0.0", "2.0.0", "1.63.0")))
        .isNotEqualTo(first);
  }
}
