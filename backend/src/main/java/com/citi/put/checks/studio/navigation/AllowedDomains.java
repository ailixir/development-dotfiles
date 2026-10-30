package com.citi.put.checks.studio.navigation;

import java.net.IDN;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The deployment's domain allow-list: the only control on where Studio may navigate
 * (STUDIO-FLEX-001).
 *
 * <p>An entry is one lowercase punycode host suffix. A candidate URL is allowed when its host
 * equals an entry or ends with {@code "." + entry}; matching is on label boundaries only, so {@code
 * evilciti.com} and {@code citi.com.evil.com} never match {@code citi.com}. A page may use {@code
 * http} or {@code https} on any port. The empty list denies everything.
 *
 * <p>The configuration is refused as a whole (startup fails) on a wildcard, an IP literal, a
 * scheme, a port, a path, a trailing dot, uppercase, more than {@value #MAX_ENTRIES} entries, or
 * two entries where one is a suffix of the other, so exactly one entry matches any page. The runner
 * applies the same rule to {@code STUDIO_RUNNER_ALLOWED_DOMAINS}; both consume {@code
 * docs/specs/studio/allowed-domains-vectors.json}.
 *
 * <p><b>Allow-all.</b> The deployment option {@code studio.navigation.allow-all-domains} / {@code
 * STUDIO_ALLOW_ALL_DOMAINS} (on by default for now; {@code application.yml} defaults it to {@code
 * true}) lets a navigation reach any host whose URL passes {@link #hostOf}: an http(s) DNS name,
 * still no userinfo and no IP literal. The configured list is then ignored for matching (it is
 * still validated, so a typo is not hidden by the option). {@link #allows} is the one place that
 * decides, so every caller (start URL, origins of a secret, replay origin pins, the guided bridge)
 * follows the option without a check of its own. The runner reads {@code
 * STUDIO_RUNNER_ALLOW_ALL_DOMAINS}, which the chart renders from the same value.
 *
 * <p>The list is deployment configuration read at use, never copied into a session or a revision:
 * replay pins each step to the origin it learned on, so a step runs only when its origin is also on
 * the list as it stands then.
 */
public final class AllowedDomains {
  public static final int MAX_ENTRIES = 32;

  /** Normative entry grammar of the vectors file; also the shape a converted host must have. */
  private static final Pattern ENTRY =
      Pattern.compile(
          "(?=.{1,253}\\z)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)*"
              + "[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?");

  private static final AllowedDomains NONE = new AllowedDomains(List.of());

  private final List<String> entries;
  private final boolean allowAll;

  /**
   * @throws IllegalArgumentException when any entry breaks the grammar, the list has more than
   *     {@link #MAX_ENTRIES} entries, or two entries overlap
   */
  public AllowedDomains(List<String> entries) {
    this(entries, false);
  }

  /**
   * The list plus the allow-all option. The list is validated either way; with {@code allowAll} it
   * is kept for display but ignored for matching.
   *
   * @throws IllegalArgumentException as {@link #AllowedDomains(List)}
   */
  public AllowedDomains(List<String> entries, boolean allowAll) {
    if (entries.size() > MAX_ENTRIES) {
      throw invalid("TOO_MANY", null);
    }
    for (String entry : entries) {
      String reason = entryProblem(entry);
      if (reason != null) {
        throw invalid(reason, entry);
      }
    }
    for (int i = 0; i < entries.size(); i++) {
      for (int j = i + 1; j < entries.size(); j++) {
        String a = entries.get(i), b = entries.get(j);
        if (a.equals(b) || a.endsWith("." + b) || b.endsWith("." + a)) {
          throw invalid("OVERLAP", a + " / " + b);
        }
      }
    }
    this.entries = List.copyOf(entries);
    this.allowAll = allowAll;
  }

  /** The empty list: denies everything. */
  public static AllowedDomains none() {
    return NONE;
  }

  /**
   * The environment form: unset or empty is the empty list; anything else is split on {@code ","}
   * with no trimming, and every segment must be a valid entry.
   */
  public static AllowedDomains parse(String commaSeparated) {
    if (commaSeparated == null || commaSeparated.isEmpty()) {
      return NONE;
    }
    return new AllowedDomains(List.of(commaSeparated.split(",", -1)));
  }

  /**
   * The option form {@code STUDIO_ALLOW_ALL_DOMAINS}, as this method reads a value it is given: a
   * {@code null} or empty value and {@code "false"} are off, {@code "true"} is on, and anything
   * else (including {@code TRUE}, {@code 1}, {@code yes} or a padded value) is refused so a typo
   * never silently leaves the option off or on. The deployment default when the variable is unset
   * is on: the {@code application.yml} placeholder supplies {@code true}, so {@code null} only
   * reaches this method from a caller that has no value (the empty-string case is in the vectors
   * file).
   *
   * @throws IllegalArgumentException when the value is anything else
   */
  public static boolean parseAllowAll(String value) {
    if (value == null || value.isEmpty() || value.equals("false")) {
      return false;
    }
    if (value.equals("true")) {
      return true;
    }
    throw new IllegalArgumentException(
        "studio.navigation.allow-all-domains is invalid; it must be true or false (or unset)");
  }

  /** The list and the allow-all option from their environment forms; both are validated. */
  public static AllowedDomains parse(String commaSeparated, String allowAll) {
    List<String> entries = parse(commaSeparated).entries();
    return new AllowedDomains(entries, parseAllowAll(allowAll));
  }

  /** The configured list. Under {@link #allowAll()} it is not consulted. */
  public List<String> entries() {
    return entries;
  }

  /** True when the allow-all option is on: any URL that passes {@link #hostOf} is allowed. */
  public boolean allowAll() {
    return allowAll;
  }

  /**
   * True when the URL is http(s), well formed for this purpose, and its host is on the list (or the
   * allow-all option is on).
   */
  public boolean allows(String url) {
    String host = hostOf(url);
    if (host == null) {
      return false;
    }
    if (allowAll) {
      return true;
    }
    for (String entry : entries) {
      if (host.equals(entry) || host.endsWith("." + entry)) {
        return true;
      }
    }
    return false;
  }

  /**
   * The lowercase punycode host of a candidate URL, or null when the URL is not an eligible http(s)
   * URL: a backslash, space or control character; a scheme other than http(s); an empty authority;
   * user info, a percent sign or a bracket in the authority; a port that is not 1 to 65535; or a
   * host that is not an entry-shaped name (this refuses a trailing dot, an empty label, an
   * underscore and every IP literal).
   */
  public static String hostOf(String url) {
    if (url == null) {
      return null;
    }
    for (int i = 0; i < url.length(); i++) {
      char c = url.charAt(i);
      if (c == '\\' || c <= 0x20 || c == 0x7f) {
        return null;
      }
    }
    int schemeLength;
    if (url.regionMatches(true, 0, "https://", 0, 8)) {
      schemeLength = 8;
    } else if (url.regionMatches(true, 0, "http://", 0, 7)) {
      schemeLength = 7;
    } else {
      return null;
    }
    int end = url.length();
    for (int i = schemeLength; i < url.length(); i++) {
      char c = url.charAt(i);
      if (c == '/' || c == '?' || c == '#') {
        end = i;
        break;
      }
    }
    String authority = url.substring(schemeLength, end);
    if (authority.isEmpty()
        || authority.indexOf('@') >= 0
        || authority.indexOf('%') >= 0
        || authority.indexOf('[') >= 0
        || authority.indexOf(']') >= 0) {
      return null;
    }
    String host = authority;
    int colon = authority.indexOf(':');
    if (colon >= 0) {
      host = authority.substring(0, colon);
      String port = authority.substring(colon + 1);
      if (port.isEmpty() || port.length() > 5) {
        return null;
      }
      for (int i = 0; i < port.length(); i++) {
        if (port.charAt(i) < '0' || port.charAt(i) > '9') {
          return null;
        }
      }
      int value = Integer.parseInt(port);
      if (value < 1 || value > 65535) {
        return null;
      }
    }
    String ascii;
    try {
      ascii = IDN.toASCII(host).toLowerCase(java.util.Locale.ROOT);
    } catch (IllegalArgumentException conversionFailed) {
      return null;
    }
    return ENTRY.matcher(ascii).matches() ? ascii : null;
  }

  /** Why an entry is refused, or null when it is valid. */
  static String entryProblem(String entry) {
    if (entry.isEmpty()) {
      return "EMPTY_ENTRY";
    }
    for (int i = 0; i < entry.length(); i++) {
      char c = entry.charAt(i);
      if (c <= 0x20 || c == 0x7f) {
        return "WHITESPACE";
      }
    }
    if (entry.indexOf('*') >= 0) {
      return "WILDCARD";
    }
    if (entry.contains("://")) {
      return "SCHEME";
    }
    if (entry.indexOf('@') >= 0) {
      return "USERINFO";
    }
    if (entry.indexOf('/') >= 0 || entry.indexOf('?') >= 0 || entry.indexOf('#') >= 0) {
      return "PATH";
    }
    if (entry.indexOf('[') >= 0 || entry.indexOf(':') != entry.lastIndexOf(':')) {
      return "IP_LITERAL";
    }
    if (entry.indexOf(':') >= 0) {
      return "PORT";
    }
    if (entry.length() > 1 && entry.endsWith(".")) {
      return "TRAILING_DOT";
    }
    if (entry.startsWith(".") || entry.contains("..") || entry.equals(".")) {
      return "EMPTY_LABEL";
    }
    for (int i = 0; i < entry.length(); i++) {
      char c = entry.charAt(i);
      if (c >= 'A' && c <= 'Z') {
        return "UPPERCASE";
      }
      if (c > 0x7f) {
        return "NOT_PUNYCODE";
      }
    }
    if (entry.length() > 253) {
      return "TOO_LONG";
    }
    if (ENTRY.matcher(entry).matches()) {
      return null;
    }
    String last = entry.substring(entry.lastIndexOf('.') + 1);
    return last.charAt(0) < 'a' || last.charAt(0) > 'z' ? "IP_LITERAL" : "INVALID_LABEL";
  }

  private static IllegalArgumentException invalid(String reason, String entry) {
    // An entry is deployment configuration, not a secret, and naming it is what lets an operator
    // fix it.
    return new IllegalArgumentException(
        "studio.navigation.allowed-domains is invalid ("
            + reason
            + (entry == null ? "" : ": '" + entry + "'")
            + "); entries are lowercase punycode host suffixes, at most "
            + MAX_ENTRIES
            + ", none a suffix of another");
  }

  /**
   * {@code studio.navigation.allowed-domains} / {@code STUDIO_ALLOWED_DOMAINS}: a comma-separated
   * list, empty by default (deny all). Bound as one string so the environment form parses exactly
   * as the vectors specify (no trimming). {@code studio.navigation.allow-all-domains} / {@code
   * STUDIO_ALLOW_ALL_DOMAINS} is bound as a string too, so only exactly {@code true} or {@code
   * false} is accepted (Spring's own boolean conversion would also take {@code yes}, {@code on} and
   * {@code 1}).
   */
  @ConfigurationProperties("studio.navigation")
  public record Properties(
      @DefaultValue("") String allowedDomains, @DefaultValue("false") String allowAllDomains) {
    public AllowedDomains domains() {
      return parse(allowedDomains, allowAllDomains);
    }
  }
}
