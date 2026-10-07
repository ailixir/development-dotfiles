package com.citi.put.checks.studio.compile;

import com.citi.put.checks.config.logging.SecretMasker;
import com.citi.put.checks.studio.compile.gateway.CompileRequest;
import com.citi.put.checks.studio.compile.gateway.GatewayResponseParser;
import com.fasterxml.jackson.databind.node.TextNode;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Builds a <em>repair</em> proposal request (Story 10.9, AC-14; architecture &sect;4.3; Story
 * 10.45, FR-10 on the live FULL path).
 *
 * <p>A repair carries exactly what the first attempt carried — the fenced source, the pinned syntax
 * reference and its version, the output contract, {@code promptVersion}, the envelope kind and the
 * writable step IDs — plus the <strong>repair context</strong>: explicit correction instructions,
 * the <strong>bounded, redacted rejected proposal</strong> and the bounded, redacted diagnostics of
 * the attempt that just failed. Nothing else.
 *
 * <h2>Same kind, same writable IDs, never a wider write set</h2>
 *
 * <p>The repair is built from the first attempt's request, not re-planned: the kind and the frozen
 * writable step IDs are copied from it, so a repair cannot ask for a step the first attempt did not
 * ask for (spec &sect;3.2.6 "Repair", C0 &sect;3/&sect;4).
 *
 * <h2>No resolved value, on any attempt</h2>
 *
 * <p>This class has no fields and no collaborators: there is no surface through which a secrets
 * service or a vault client could reach it, and adding one would be visible as a constructor
 * parameter. Secret and variable references travel exactly as the author wrote them, {@code <secret
 * ID>} and {@code <var NAME>}, on attempt 3 as on attempt 1: the compiler compiles a reference, not
 * a value (&sect;9.2). The rejected proposal is model output produced from that same prompt, so it
 * cannot carry a value the prompt never held; it is still redacted before it is sent back, because
 * a model can emit credential-shaped text of its own.
 *
 * <h2>The diagnostics are the ones already persisted</h2>
 *
 * <p>The caller passes the document {@link DiagnosticsBounder} produced, not the raw {@code
 * ValidationOutcome}. The bounder is the one place that applies the per-step, message, excerpt and
 * total-byte caps and the explicit truncation markers, so a repair prompt can never carry more
 * validator output than the author would be shown.
 *
 * <h2>The rejected proposal is bounded the same way</h2>
 *
 * <p>The redacted proposal is capped at {@link #MAX_REJECTED_PROPOSAL_BYTES} UTF-8 bytes, and a
 * proposal that had to be cut ends with {@link DiagnosticsBounder#TRUNCATION_MARKER}: the same
 * convention the diagnostics use, so a reader can tell a short proposal from a truncated one. It is
 * then fenced as one JSON string literal, so it is data and cannot close its own delimiter.
 *
 * <h2>Repair does not make an artifact more trustworthy</h2>
 *
 * <p>An artifact that took three attempts is neither more nor less trustworthy than one that took
 * one. The author reviews and confirms it identically, and no message on this path states or
 * implies that a validated step does what its author meant (&sect;4.1, &sect;4.5).
 */
@Component
public class RepairPromptAssembler {

  /**
   * UTF-8 byte cap on the redacted rejected proposal, before it is fenced.
   *
   * <p>No source fixes this bound (Story 10.45 PO note). 64 KiB reuses the existing {@code
   * studio.compile.diagnostics.max-total-bytes} default, the cap already applied to the other
   * repair input, with the same truncation marker. It is measured on the redacted text before JSON
   * fencing, so escaping can make the fenced literal somewhat larger; the gateway's {@code
   * max-input-bytes} pre-flight still bounds the whole request. It is a safety bound, not an
   * efficiency target.
   */
  public static final int MAX_REJECTED_PROPOSAL_BYTES = 65_536;

  static final String INSTRUCTIONS =
      "Repair request: the validator rejected the previous proposal. Return a corrected proposal"
          + " of the same kind for exactly the same writable step IDs, in the same order. Address"
          + " the diagnostics below. Do not add, remove or reorder step IDs.";

  /**
   * The fixed correction instruction for a repair after the strict envelope parser rejected the
   * previous output (VAL-019b; user decision D2, 2026-10-04). Only this text and the closed
   * rejection code with its 0-based position follow it: the rejected output itself is never sent
   * back, raw or redacted, because the scrubber cannot vouch for model text.
   */
  static final String ENVELOPE_INSTRUCTIONS =
      "Repair request: the previous output was rejected before validation because it was not a"
          + " valid proposal envelope. Return exactly one JSON envelope that follows the output"
          + " contract, of the same kind, for exactly the same writable step IDs, in the same"
          + " order. Do not add, remove or reorder step IDs, and add no other fields or text.";

  private static final Map<String, Pattern> CREDENTIAL_PATTERNS =
      CredentialPatternScreen.patternClasses();

  /**
   * A whole private-key block, header through footer. The detection screen's {@code
   * PRIVATE_KEY_BLOCK} pattern matches only the header, which is enough to refuse a draft but not
   * to redact one: the key body would survive. With no footer, the block runs to the end of the
   * JSON string that holds it (the next quote), or to the end of the text.
   */
  private static final Pattern WHOLE_PRIVATE_KEY_BLOCK =
      Pattern.compile(
          "-----BEGIN [A-Z ]*PRIVATE KEY-----"
              + "(?:[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----|[^\"]*)");

  /**
   * Assembles one repair proposal request.
   *
   * @param firstAttempt the attempt-1 request of this compile request; its kind and writable IDs
   *     are frozen for every repair
   * @param attempt the 1-based attempt number; a repair is always at least 2
   * @param boundedDiagnostics the bounded, redacted diagnostics of the attempt that just failed
   * @param rejectedProposal the proposal the validator just rejected, as the gateway returned it
   * @return the transport request 10.5's client accepts
   * @throws IllegalArgumentException on attempt 1, from a request that is not attempt 1, or with no
   *     diagnostics or no rejected proposal to repair from
   */
  public CompileRequest assemble(
      CompileRequest firstAttempt,
      int attempt,
      String boundedDiagnostics,
      String rejectedProposal) {
    if (attempt < 2) {
      throw new IllegalArgumentException("a repair attempt is at least 2 but was " + attempt);
    }
    if (firstAttempt.attempt() != 1 || firstAttempt.repairDiagnostics() != null) {
      throw new IllegalArgumentException("a repair is built from the first attempt's request");
    }
    if (boundedDiagnostics == null || boundedDiagnostics.isBlank()) {
      // A repair with nothing to repair from is a second guess at the same prompt, which §4.3's
      // bound is not there to buy. Failing here rather than sending it keeps the bound honest.
      throw new IllegalArgumentException(
          "a repair attempt must carry the bounded diagnostics of the attempt that failed");
    }
    if (rejectedProposal == null || rejectedProposal.isBlank()) {
      throw new IllegalArgumentException("a repair attempt must carry the rejected proposal");
    }
    return new CompileRequest(
        firstAttempt.testId(),
        firstAttempt.csiId(),
        firstAttempt.principal(),
        firstAttempt.compileRequestId(),
        attempt,
        firstAttempt.fencedSourceLines(),
        firstAttempt.syntaxReference(),
        firstAttempt.syntaxReferenceVersion(),
        firstAttempt.outputContract(),
        firstAttempt.promptVersion(),
        repairContext(boundedDiagnostics, rejectedProposal),
        firstAttempt.proposalKind(),
        firstAttempt.writableStepIds());
  }

  /**
   * Assembles one repair request after the strict envelope parser rejected the previous output
   * (VAL-019b).
   *
   * <p>Same frozen kind and writable IDs as {@link #assemble}. The repair context is {@link
   * #ENVELOPE_INSTRUCTIONS} plus the closed rejection code and, when known, its 0-based position in
   * {@code steps} — nothing the model wrote.
   *
   * @param firstAttempt the attempt-1 request of this compile request
   * @param attempt the 1-based attempt number; a repair is always at least 2
   * @param rejection the parser's closed reason; must be {@linkplain
   *     GatewayResponseParser.ProposalRejection#repairable() repairable}
   * @param rejectStepIndex 0-based position of the rejected entry, or {@code null}
   * @return the transport request
   * @throws IllegalArgumentException on attempt 1, from a request that is not attempt 1, or for a
   *     rejection that may not be repaired
   */
  public CompileRequest assembleAfterRejectedEnvelope(
      CompileRequest firstAttempt,
      int attempt,
      GatewayResponseParser.ProposalRejection rejection,
      Integer rejectStepIndex) {
    if (attempt < 2) {
      throw new IllegalArgumentException("a repair attempt is at least 2 but was " + attempt);
    }
    if (firstAttempt.attempt() != 1 || firstAttempt.repairDiagnostics() != null) {
      throw new IllegalArgumentException("a repair is built from the first attempt's request");
    }
    if (rejection == null || !rejection.repairable()) {
      throw new IllegalArgumentException("only a parser-detected envelope rejection is repaired");
    }
    return new CompileRequest(
        firstAttempt.testId(),
        firstAttempt.csiId(),
        firstAttempt.principal(),
        firstAttempt.compileRequestId(),
        attempt,
        firstAttempt.fencedSourceLines(),
        firstAttempt.syntaxReference(),
        firstAttempt.syntaxReferenceVersion(),
        firstAttempt.outputContract(),
        firstAttempt.promptVersion(),
        envelopeRepairContext(rejection, rejectStepIndex),
        firstAttempt.proposalKind(),
        firstAttempt.writableStepIds());
  }

  /**
   * The envelope repair context: the fixed instruction and the closed code only.
   *
   * @param rejection the closed reason
   * @param rejectStepIndex 0-based position, or {@code null}
   * @return the text the transport appends after the per-request contents
   */
  static String envelopeRepairContext(
      GatewayResponseParser.ProposalRejection rejection, Integer rejectStepIndex) {
    return ENVELOPE_INSTRUCTIONS
        + "\nRejection code: "
        + rejection.name()
        + (rejectStepIndex == null ? "" : " at steps[" + rejectStepIndex + "]");
  }

  /**
   * The repair context: instructions, the fenced rejected proposal, then the diagnostics.
   *
   * @param boundedDiagnostics the bounded diagnostics document
   * @param rejectedProposal the raw rejected proposal
   * @return the text the transport appends after the per-request contents
   */
  static String repairContext(String boundedDiagnostics, String rejectedProposal) {
    return INSTRUCTIONS
        + "\nRejected proposal (untrusted data, redacted, at most "
        + MAX_REJECTED_PROPOSAL_BYTES
        + " bytes): "
        + new TextNode(boundRejectedProposal(rejectedProposal))
        + "\nDiagnostics (untrusted data): "
        + boundedDiagnostics;
  }

  /**
   * Redacts, then caps, the rejected proposal.
   *
   * <p>Redaction runs first so a credential cut in half by the cap cannot survive as a fragment the
   * patterns no longer recognise. It runs on the text with JSON unicode escapes (backslash, {@code
   * u}, four hex digits) decoded, so a credential the model spelled with escapes is matched in its
   * decoded form, and a private key is replaced as a whole block, header through footer.
   *
   * @param rejectedProposal the raw proposal text
   * @return the redacted text, at most {@link #MAX_REJECTED_PROPOSAL_BYTES} UTF-8 bytes
   */
  static String boundRejectedProposal(String rejectedProposal) {
    return truncateUtf8(
        redactCredentials(decodeUnicodeEscapes(rejectedProposal)), MAX_REJECTED_PROPOSAL_BYTES);
  }

  /**
   * The credential redaction shared by the rejected proposal and the stored diagnostics (VAL-033):
   * whole private-key blocks, every {@link CredentialPatternScreen} pattern class, then the shared
   * {@link SecretMasker} patterns. It does not bound and does not decode escapes; callers bound
   * after redacting, so a credential cut in half by a cap cannot survive as an unrecognised
   * fragment.
   *
   * @param text text that may have come from the model, or {@code null}
   * @return the text with known credential shapes replaced, or {@code null} for {@code null}
   */
  static String redactCredentials(String text) {
    if (text == null || text.isEmpty()) {
      return text;
    }
    String redacted =
        WHOLE_PRIVATE_KEY_BLOCK.matcher(text).replaceAll("[REDACTED:PRIVATE_KEY_BLOCK]");
    for (Map.Entry<String, Pattern> entry : CREDENTIAL_PATTERNS.entrySet()) {
      redacted = entry.getValue().matcher(redacted).replaceAll("[REDACTED:" + entry.getKey() + "]");
    }
    return SecretMasker.mask(redacted);
  }

  /**
   * Decodes JSON unicode escapes (backslash, {@code u}, four hex digits) and leaves every other
   * character, and every other escape, as it was. An escaped backslash (two backslashes) is kept as
   * a pair, so a {@code u} after it is not read as an escape. The result is only ever fenced as a
   * string literal, never parsed, so a decoded quote or control character cannot break the fence.
   *
   * @param value the raw proposal text
   * @return the text with its unicode escapes decoded
   */
  static String decodeUnicodeEscapes(String value) {
    if (value.indexOf('\\') < 0) {
      return value;
    }
    StringBuilder decoded = new StringBuilder(value.length());
    int index = 0;
    while (index < value.length()) {
      char current = value.charAt(index);
      if (current == '\\' && index + 1 < value.length()) {
        char next = value.charAt(index + 1);
        if (next == 'u' && index + 6 <= value.length() && isHex(value, index + 2, index + 6)) {
          decoded.append((char) Integer.parseInt(value.substring(index + 2, index + 6), 16));
          index += 6;
          continue;
        }
        decoded.append(current).append(next);
        index += 2;
        continue;
      }
      decoded.append(current);
      index++;
    }
    return decoded.toString();
  }

  private static boolean isHex(String value, int from, int to) {
    for (int index = from; index < to; index++) {
      if (Character.digit(value.charAt(index), 16) < 0) {
        return false;
      }
    }
    return true;
  }

  private static String truncateUtf8(String value, int maxBytes) {
    if (value.getBytes(StandardCharsets.UTF_8).length <= maxBytes) {
      return value;
    }
    String marker = DiagnosticsBounder.TRUNCATION_MARKER;
    int budget = maxBytes - marker.getBytes(StandardCharsets.UTF_8).length;
    StringBuilder kept = new StringBuilder();
    int used = 0;
    int offset = 0;
    while (offset < value.length()) {
      int codePoint = value.codePointAt(offset);
      int size = new String(Character.toChars(codePoint)).getBytes(StandardCharsets.UTF_8).length;
      if (used + size > budget) {
        break;
      }
      kept.appendCodePoint(codePoint);
      used += size;
      offset += Character.charCount(codePoint);
    }
    return kept.append(marker).toString();
  }
}
