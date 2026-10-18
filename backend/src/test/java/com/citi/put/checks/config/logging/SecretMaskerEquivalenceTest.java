package com.citi.put.checks.config.logging;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.SplittableRandom;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * STUDIO-OBS-012A DECISION-2 step 2a / finding F-3: SecretMasker must run in linear time and give
 * byte-identical output to the original masker.
 *
 * <p>The original six patterns and the original {@code mask} loop are copied below exactly as the
 * oracle. Masking is security-relevant, so a single divergence fails the test. The corpus also has
 * to catch the known non-equivalent rewrite (a lookbehind without {@code \G}), or a pass would
 * prove nothing.
 */
class SecretMaskerEquivalenceTest {

  /** The original SecretMasker patterns, copied exactly. The test-side oracle. */
  private static final List<Pattern> ORACLE_PATTERNS =
      List.of(
          Pattern.compile("(?i)(\"password\"\\s*:\\s*\")([^\"]*)(\")"),
          Pattern.compile("(?i)(\"secret\"\\s*:\\s*\")([^\"]*)(\")"),
          Pattern.compile("(?i)(\"token\"\\s*:\\s*\")([^\"]*)(\")"),
          Pattern.compile("(?i)(\"api[_-]?key\"\\s*:\\s*\")([^\"]*)(\")"),
          Pattern.compile("(?i)(\"authorization\"\\s*:\\s*\")([^\"]*)(\")"),
          Pattern.compile("([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\\.[A-Za-z]{2,})"));

  /**
   * Known NON-equivalent rewrite (lookbehind only, no {@code \G}). Used only to show the corpus can
   * tell it apart from the oracle. It misses the second address in {@code x@a.bc1@e.fg}.
   */
  private static final Pattern LOOKBEHIND_ONLY_EMAIL =
      Pattern.compile("(?<![A-Za-z0-9._%+-])([A-Za-z0-9._%+-]++)@([A-Za-z0-9.-]+\\.[A-Za-z]{2,})");

  private static final long RANDOM_SEED = 0x5EC12E7L;
  private static final int RANDOM_CHAR_CASES = 50_000;
  private static final int RANDOM_FRAGMENT_CASES = 50_000;

  /** Timing guard bound. Old pattern: about 17.8 s at 64,000 chars; new: a few ms. */
  private static final long LINEAR_TIME_BOUND_MS = 2_000;

  private static final int LONG_RUN = 64_000;

  private static final String CHAR_ALPHABET =
      "abcxyzABCXYZ0189._%+-@@@...  \t\n\":{}é€" + "\uD83D\uDE00";

  private static final String[] FRAGMENTS = {
    "x",
    "a",
    "b",
    "bc",
    "fg",
    "1",
    "9",
    "Z",
    "@",
    "@",
    ".",
    ".",
    "..",
    "-",
    "_",
    "%",
    "+",
    " ",
    "e.fg",
    "a.bc",
    "a.b",
    "co",
    "com",
    "citi.com",
    "x@a.bc1",
    "@e.fg",
    "a@b",
    "@@",
    ".c",
    "c.",
    "\"",
    ":",
    "\"password\":\"",
    "\"Token\" : \"",
    "\"api-key\":\"",
    "\"secret\":\"",
    "\"authorization\":\"",
    "é",
    "ü",
    "\uD83D\uDE00",
    "\n",
    "-.",
    "%+",
    "1@",
    "@1",
    "._%+-"
  };

  @Test
  void handWrittenAdjacencyCasesMatchTheOriginalByteForByte() {
    for (String input : handWrittenCases()) {
      assertThat(SecretMasker.mask(input))
          .as("input %s", visible(input))
          .isEqualTo(oracleMask(input));
    }
  }

  @Test
  void nullStaysNullAndEmptyStaysEmpty() {
    assertThat(SecretMasker.mask(null)).isNull();
    assertThat(SecretMasker.mask("")).isEmpty();
    assertThat(oracleMask("")).isEmpty();
  }

  @Test
  void theSecondAddressInAnAdjacencyChainIsStillMasked() {
    // Exact expected bytes, not only oracle agreement. Both local parts are masked.
    assertThat(SecretMasker.mask("x@a.bc1@e.fg")).isEqualTo("***@a.bc***@e.fg");
    assertThat(oracleMask("x@a.bc1@e.fg")).isEqualTo("***@a.bc***@e.fg");
  }

  @Test
  void seededRandomCorpusMatchesTheOriginalByteForByte() {
    List<String> corpus = randomCorpus();
    assertThat(corpus).hasSize(RANDOM_CHAR_CASES + RANDOM_FRAGMENT_CASES);

    List<String> divergences = new ArrayList<>();
    int masked = 0;
    for (String input : corpus) {
      String expected = oracleMask(input);
      String actual = SecretMasker.mask(input);
      if (!expected.equals(actual)) {
        divergences.add(
            visible(input) + " expected=" + visible(expected) + " actual=" + visible(actual));
      }
      if (!expected.equals(input)) {
        masked++;
      }
    }

    assertThat(divergences)
        .as("divergences from the original masker (seed %s)", RANDOM_SEED)
        .isEmpty();
    // The corpus must exercise masking, not only pass-through, or agreement proves little.
    assertThat(masked).as("inputs the oracle actually masked").isGreaterThan(corpus.size() / 10);
  }

  @Test
  void theCorpusDetectsTheKnownNonEquivalentRewrite() {
    // Shows the comparison above can fail: the lookbehind-only rewrite must diverge from the
    // oracle on the hand-written cases and on the seeded random corpus.
    long handWrittenMisses =
        handWrittenCases().stream()
            .filter(s -> !oracleMask(s).equals(maskWithEmailPattern(s, LOOKBEHIND_ONLY_EMAIL)))
            .count();
    long randomMisses =
        randomCorpus().stream()
            .filter(s -> !oracleMask(s).equals(maskWithEmailPattern(s, LOOKBEHIND_ONLY_EMAIL)))
            .count();

    assertThat(handWrittenMisses).isPositive();
    assertThat(randomMisses).isPositive();
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("longRuns")
  void longRunsMaskInLinearTime(String shape, String input, String expected) {
    long start = System.nanoTime();
    String output = SecretMasker.mask(input);
    long elapsedMs = (System.nanoTime() - start) / 1_000_000;

    // Measured value goes to the JUnit XML system-out so the evidence ledger can quote it.
    System.out.printf(
        "SecretMasker timing guard shape=%s length=%d elapsedMs=%d boundMs=%d%n",
        shape, input.length(), elapsedMs, LINEAR_TIME_BOUND_MS);
    assertThat(output).isEqualTo(expected);
    assertThat(elapsedMs)
        .as("%s (%d chars) took %d ms", shape, input.length(), elapsedMs)
        .isLessThan(LINEAR_TIME_BOUND_MS);
  }

  static Stream<Arguments> longRuns() {
    String localRun = "a".repeat(LONG_RUN);
    String mixedRun = "aB3._%+-".repeat(LONG_RUN / 8);
    String dottedDomainRun = "x@" + "a.".repeat(LONG_RUN / 2);
    String unterminatedField = "{\"password\":\"" + "v".repeat(LONG_RUN);
    return Stream.of(
        Arguments.of("no-@ local-part run", localRun, localRun),
        Arguments.of("no-@ mixed ._%+- run", mixedRun, mixedRun),
        Arguments.of("@ then dotted run with no TLD", dottedDomainRun, dottedDomainRun),
        Arguments.of("unterminated password field", unterminatedField, unterminatedField),
        Arguments.of(
            "long local part before one address",
            "a".repeat(LONG_RUN) + "@citi.com",
            "***@citi.com"));
  }

  private static List<String> handWrittenCases() {
    String run = "a".repeat(2_000);
    return List.of(
        "",
        " ",
        "@",
        "@@",
        "a@",
        "@b.co",
        "x@a.bc1@e.fg",
        "x@a.bc1@e.fg2@h.ij",
        "x@a.bc@e.fg",
        "x@a.bc.@e.fg",
        "x@a.bc-@e.fg",
        "x@a.b1@e.fg",
        "x@a.bc%@e.fg",
        "a@b.cc@d.ee@f.gg",
        "a@b.cc d@e.ff",
        "a@b.cc,d@e.ff",
        "a@b.ccd@e.ff",
        "a@b.c@d.ee",
        "first@citi.com",
        "ends with last@citi.com",
        "first@citi.com and then last@citi.com",
        "bruno.buger@citi.com",
        "user bruno.buger@citi.com just logged in",
        "._%+-@citi.com",
        "._%+-._%+-",
        "-._%+-@-.-.co",
        "x@-.co",
        "x@..co",
        "x@a..co",
        "x@a.c",
        "x@a.c1",
        "x@a.1co",
        "x@a.co1.de",
        "x@@a.co",
        "x@a.co@@b.co",
        "é@a.co",
        "aé@a.co",
        "éa@a.co",
        "a@é.co",
        "a@b.cé",
        "\uD83D\uDE00x@a.co\uD83D\uDE00",
        "naïve.user@exämple.com",
        "{\"password\":\"p@ss.word\",\"email\":\"a@b.co\"}",
        "{\"token\":\"x@a.bc1@e.fg\"}",
        "{\"Authorization\" : \"Bearer abc\"} x@a.bc1@e.fg",
        "{\"api_key\":\"k\",\"apikey\":\"k2\",\"api-key\":\"k3\"}",
        "{\"secret\":\"unterminated",
        run,
        run + "@",
        run + "@citi.com",
        run + "@citi.com" + run,
        "x@a.bc1" + run + "@e.fg",
        "x@" + "a.".repeat(500),
        "x@" + "a.".repeat(500) + "co");
  }

  private static List<String> randomCorpus() {
    SplittableRandom random = new SplittableRandom(RANDOM_SEED);
    List<String> corpus = new ArrayList<>(RANDOM_CHAR_CASES + RANDOM_FRAGMENT_CASES);
    int[] alphabet = CHAR_ALPHABET.codePoints().toArray();
    for (int i = 0; i < RANDOM_CHAR_CASES; i++) {
      int length = random.nextInt(0, 60);
      StringBuilder sb = new StringBuilder(length);
      for (int j = 0; j < length; j++) {
        sb.appendCodePoint(alphabet[random.nextInt(alphabet.length)]);
      }
      corpus.add(sb.toString());
    }
    for (int i = 0; i < RANDOM_FRAGMENT_CASES; i++) {
      int count = random.nextInt(0, 16);
      StringBuilder sb = new StringBuilder();
      for (int j = 0; j < count; j++) {
        sb.append(FRAGMENTS[random.nextInt(FRAGMENTS.length)]);
      }
      corpus.add(sb.toString());
    }
    return corpus;
  }

  /** The original SecretMasker.mask loop, copied exactly, using the oracle patterns. */
  private static String oracleMask(String input) {
    return maskWithEmailPattern(input, ORACLE_PATTERNS.get(5));
  }

  private static String maskWithEmailPattern(String input, Pattern emailPattern) {
    if (input == null || input.isEmpty()) {
      return input;
    }
    String result = input;
    for (int i = 0; i < ORACLE_PATTERNS.size(); i++) {
      Pattern p = i == 5 ? emailPattern : ORACLE_PATTERNS.get(i);
      if (i < 5) {
        result = p.matcher(result).replaceAll("$1***$3");
      } else {
        result = p.matcher(result).replaceAll("***@$2");
      }
    }
    return result;
  }

  private static String visible(String s) {
    if (s == null) {
      return "null";
    }
    String shown = s.length() > 200 ? s.substring(0, 200) + "...(" + s.length() + " chars)" : s;
    return "\"" + shown.replace("\n", "\\n").replace("\t", "\\t") + "\"";
  }
}
