package com.citi.put.checks.studio.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * RFC 9110 §14 at the unit level — a supplement to {@code ExecutionVideoRangeIT}, never a
 * replacement for it.
 *
 * <p>Story 10.15 AC-25: every claim about what is <em>sent</em> is asserted on captured response
 * bytes. This file asserts nothing about a response; it pins the parser's three outcomes so that a
 * change of intent shows up here as well as at the wire.
 */
class ByteRangeRequestTest {

  private static final long SIZE = 1_000;

  @ParameterizedTest
  @ValueSource(
      strings = {
        "bytes=abc",
        "items=0-10",
        "bytes=",
        "bytes=-",
        "bytes=x-y",
        "bytes=1-2,5-6",
        "b",
        "  "
      })
  void anUnparseableOrUnsupportedHeaderIsIgnoredRatherThanRefused(String header) {
    assertThat(ByteRangeRequest.parse(header, SIZE).kind())
        .as("'%s' must serve the whole representation, not a 416", header)
        .isEqualTo(ByteRangeRequest.Kind.IGNORED);
  }

  @Test
  void anAbsentHeaderIsIgnored() {
    assertThat(ByteRangeRequest.parse(null, SIZE).kind()).isEqualTo(ByteRangeRequest.Kind.IGNORED);
  }

  @Test
  void theFourSatisfiableFormsResolveAgainstTheMeasuredSize() {
    assertThat(ByteRangeRequest.parse("bytes=0-0", SIZE))
        .isEqualTo(new ByteRangeRequest(ByteRangeRequest.Kind.SATISFIABLE, 0, 0));
    assertThat(ByteRangeRequest.parse("bytes=10-19", SIZE))
        .isEqualTo(new ByteRangeRequest(ByteRangeRequest.Kind.SATISFIABLE, 10, 19));
    assertThat(ByteRangeRequest.parse("bytes=990-", SIZE))
        .isEqualTo(new ByteRangeRequest(ByteRangeRequest.Kind.SATISFIABLE, 990, 999));
    assertThat(ByteRangeRequest.parse("bytes=-10", SIZE))
        .isEqualTo(new ByteRangeRequest(ByteRangeRequest.Kind.SATISFIABLE, 990, 999));
  }

  @Test
  void anEndPastTheEndIsClampedAndASuffixLongerThanTheObjectIsTheWholeObject() {
    assertThat(ByteRangeRequest.parse("bytes=500-99999", SIZE))
        .isEqualTo(new ByteRangeRequest(ByteRangeRequest.Kind.SATISFIABLE, 500, 999));
    assertThat(ByteRangeRequest.parse("bytes=-99999", SIZE))
        .isEqualTo(new ByteRangeRequest(ByteRangeRequest.Kind.SATISFIABLE, 0, 999));
  }

  @ParameterizedTest
  @ValueSource(strings = {"bytes=1000-", "bytes=1001-2000", "bytes=200-100", "bytes=-0"})
  void onlyTheGenuinelyUnsatisfiableCasesAre416(String header) {
    assertThat(ByteRangeRequest.parse(header, SIZE).kind())
        .as("'%s'", header)
        .isEqualTo(ByteRangeRequest.Kind.UNSATISFIABLE);
  }

  @Test
  void theUnitIsCaseInsensitiveAboutItsOwnName() {
    assertThat(ByteRangeRequest.parse("BYTES=0-9", SIZE).kind())
        .isEqualTo(ByteRangeRequest.Kind.SATISFIABLE);
  }
}
