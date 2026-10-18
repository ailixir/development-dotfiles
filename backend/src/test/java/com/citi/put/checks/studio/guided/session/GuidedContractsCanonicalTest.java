package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.TextNode;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * Canonical-v1 string escaping (STUDIO-OBS-014, ar-2-r14-stops.json ruling 1). The normative form
 * is the ECMAScript {@code JSON.stringify} / RFC 8785 one, which PostgreSQL jsonb text output and
 * the runner's canonicalizers already emit: C0 controls without a short escape are {@code \\u00}
 * plus two lowercase hex digits. Jackson's default writer used uppercase for nine of them.
 */
class GuidedContractsCanonicalTest {

  /** The nine code points on which Jackson's default writer and the normative form differed. */
  @ParameterizedTest
  @ValueSource(ints = {0x0B, 0x0E, 0x0F, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F})
  void controlsWithoutAShortEscapeUseLowercaseHex(int codePoint) {
    String expected = "\"" + String.format(Locale.ROOT, "\\u%04x", codePoint) + "\"";

    assertThat(GuidedContracts.canonical(TextNode.valueOf(String.valueOf((char) codePoint))))
        .isEqualTo(expected);
  }

  /** The normative canonical-v1 form of one C0 control as a JSON string. */
  private static String normative(int c) {
    return switch (c) {
      case 0x08 -> "\"\\b\"";
      case 0x09 -> "\"\\t\"";
      case 0x0A -> "\"\\n\"";
      case 0x0C -> "\"\\f\"";
      case 0x0D -> "\"\\r\"";
      default -> "\"" + String.format(Locale.ROOT, "\\u%04x", c) + "\"";
    };
  }

  @Test
  void everyC0ControlMatchesTheNormativeForm() {
    for (int c = 0; c < 0x20; c++) {
      String expected = normative(c);
      assertThat(GuidedContracts.canonical(TextNode.valueOf(String.valueOf((char) c))))
          .as("U+%04X", c)
          .isEqualTo(expected);
    }
  }

  @Test
  void quoteBackslashAreEscapedAndSlashDelRaw2028AndNonAsciiAreNot() {
    assertThat(GuidedContracts.canonical(TextNode.valueOf("\"\\"))).isEqualTo("\"\\\"\\\\\"");
    String raw = "/\u007f\u2028\u2029\ufeffé🧪";
    assertThat(GuidedContracts.canonical(TextNode.valueOf(raw))).isEqualTo("\"" + raw + "\"");
  }

  @Test
  void keysUseTheSameEscapingAndALoneSurrogateIsStillRefused() {
    var object = JsonNodeFactory.instance.objectNode().put("k", "a\u001fb");
    assertThat(GuidedContracts.canonical(object)).isEqualTo("{\"k\":\"a\\u001fb\"}");
    assertThatThrownBy(() -> GuidedContracts.canonical(TextNode.valueOf("\ud800")))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("INVALID_CONTRACT");
    assertThatThrownBy(() -> GuidedContracts.canonical(TextNode.valueOf("\udc00x")))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("INVALID_CONTRACT");
  }

  /** The architect's VF-4 vector, digest computed independently in Node and PostgreSQL. */
  @Test
  void theC0ControlsVectorHashesToTheNodeAndPostgresDigest() {
    StringBuilder text = new StringBuilder();
    for (int c = 1; c < 0x20; c++) {
      text.append((char) c);
    }
    text.append('\u007f').append('\u2028').append('/');
    var vector = JsonNodeFactory.instance.objectNode().put("text", text.toString());

    assertThat(GuidedContracts.hash(vector))
        .isEqualTo("461d598cc84eb368f03e7f9b37c61b516ad5259d5aab7b347ac955614958c119");
  }
}
