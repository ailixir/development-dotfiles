package com.citi.put.checks.studio.evidence;

import java.util.Locale;

/**
 * One parsed {@code Range} header, resolved against the <b>measured</b> object size (story 10.15
 * AC-13, AC-14).
 *
 * <p>RFC 9110 §14 is followed rather than improvised, and the three outcomes it distinguishes are
 * distinguished here:
 *
 * <ul>
 *   <li><b>Ignored</b> — absent, not {@code bytes=}, syntactically unparseable, or a multi-range
 *       set this server does not serve. RFC 9110 §14.2: a recipient that cannot understand a Range
 *       header <em>ignores</em> it and answers the whole representation. This is the case that
 *       stops "everything is 416" from passing.
 *   <li><b>Unsatisfiable</b> — a first-byte position at or past the end, a zero-length suffix, or
 *       an inverted range. Answered {@code 416} with a {@code Content-Range} of {@code bytes *}
 *       then {@code /S}.
 *   <li><b>Satisfiable</b> — a concrete inclusive {@code [firstByte, lastByte]} window, with a last
 *       byte past the end <b>clamped</b> rather than refused (§14.1.1).
 * </ul>
 *
 * <p>Every bound is computed from the size passed in, which the caller measured from the object.
 * Nothing here is transcribed, so resizing the fixture cannot silently turn a satisfiable case into
 * an unsatisfiable one.
 */
public record ByteRangeRequest(Kind kind, long firstByte, long lastByte) {

  /** What the header resolved to. */
  public enum Kind {
    /** Serve the whole representation: there was no usable Range header. */
    IGNORED,
    /** {@code 416}: the range cannot be served for an object of this size. */
    UNSATISFIABLE,
    /** {@code 206}: serve exactly {@code [firstByte, lastByte]}. */
    SATISFIABLE
  }

  private static final String BYTES_UNIT = "bytes=";

  public boolean satisfiable() {
    return kind == Kind.SATISFIABLE;
  }

  public long length() {
    return lastByte - firstByte + 1;
  }

  /** Parses {@code header} against an object of {@code size} bytes. */
  public static ByteRangeRequest parse(String header, long size) {
    if (header == null) {
      return ignored();
    }
    String trimmed = header.trim();
    if (trimmed.length() < BYTES_UNIT.length()
        || !trimmed.substring(0, BYTES_UNIT.length()).toLowerCase(Locale.ROOT).equals(BYTES_UNIT)) {
      // `items=0-10`, an empty value, or anything else that is not the bytes unit.
      return ignored();
    }
    String spec = trimmed.substring(BYTES_UNIT.length()).trim();
    if (spec.isEmpty() || spec.indexOf(',') >= 0) {
      // A multi-range set is a legitimate request this server does not serve; ignoring it and
      // answering 200 is RFC 9110's own remedy and is honest. Refusing it as 416 would not be.
      return ignored();
    }
    int dash = spec.indexOf('-');
    if (dash < 0) {
      return ignored();
    }
    String firstSpec = spec.substring(0, dash).trim();
    String lastSpec = spec.substring(dash + 1).trim();

    if (firstSpec.isEmpty()) {
      // Suffix form, `bytes=-n`: the last n bytes.
      long suffix = parseOrMinusOne(lastSpec);
      if (suffix < 0) {
        return ignored();
      }
      if (suffix == 0 || size == 0) {
        return unsatisfiable();
      }
      long start = Math.max(0, size - suffix);
      return new ByteRangeRequest(Kind.SATISFIABLE, start, size - 1);
    }

    long first = parseOrMinusOne(firstSpec);
    if (first < 0) {
      return ignored();
    }
    if (lastSpec.isEmpty()) {
      // Open-ended, `bytes=x-`.
      return first >= size
          ? unsatisfiable()
          : new ByteRangeRequest(Kind.SATISFIABLE, first, size - 1);
    }
    long last = parseOrMinusOne(lastSpec);
    if (last < 0) {
      return ignored();
    }
    if (last < first || first >= size) {
      return unsatisfiable();
    }
    // An end past the end of the object is clamped, not refused (RFC 9110 §14.1.1).
    return new ByteRangeRequest(Kind.SATISFIABLE, first, Math.min(last, size - 1));
  }

  private static ByteRangeRequest ignored() {
    return new ByteRangeRequest(Kind.IGNORED, -1, -1);
  }

  private static ByteRangeRequest unsatisfiable() {
    return new ByteRangeRequest(Kind.UNSATISFIABLE, -1, -1);
  }

  private static long parseOrMinusOne(String value) {
    if (value.isEmpty()) {
      return -1;
    }
    for (int i = 0; i < value.length(); i++) {
      if (value.charAt(i) < '0' || value.charAt(i) > '9') {
        return -1;
      }
    }
    try {
      return Long.parseLong(value);
    } catch (NumberFormatException e) {
      return -1;
    }
  }
}
