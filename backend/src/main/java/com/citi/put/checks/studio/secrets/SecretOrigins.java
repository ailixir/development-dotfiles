package com.citi.put.checks.studio.secrets;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * The origins a secret may be filled on, as its own vault entry declares them.
 *
 * <p>A secret's KV v2 entry carries an {@value #VAULT_KEY} key next to its value: a comma-separated
 * list such as {@code https://login.app.example,https://sso.app.example}, owned by whoever owns the
 * secret. The runner refuses to type the secret on a page whose origin is not in the list ({@code
 * SECRET_ORIGIN_NOT_ALLOWED}).
 *
 * <p>Each entry is normalized to the form a browser's {@code URL.origin} renders — {@code
 * scheme://host[:port]}, lowercase scheme and host, default port dropped — so the runner can
 * compare with string equality. Only {@code http} and {@code https} are accepted, and an entry
 * carrying a path, query, fragment or user info is not an origin.
 *
 * <p><b>Fail closed.</b> One malformed entry makes the whole list empty rather than dropping that
 * entry: a list the owner wrote wrongly is not a list anyone can reason about, and an empty list
 * means the secret cannot be filled anywhere. The same holds for an over-long list.
 */
public final class SecretOrigins {

  /** The key, next to the value key, that holds the comma-separated origins. */
  public static final String VAULT_KEY = "allowedOrigins";

  /** Upper bound on origins per secret. Matches the runner's envelope bound. */
  public static final int MAX_ORIGINS = 16;

  /** Upper bound on one entry's length. Matches the runner's envelope bound. */
  public static final int MAX_ORIGIN_LENGTH = 512;

  private SecretOrigins() {}

  /**
   * Parses and normalizes a comma-separated origin list.
   *
   * @param raw the stored list, possibly {@code null}
   * @return the normalized, de-duplicated origins in declared order, or an empty list when {@code
   *     raw} is absent, blank or malformed in any entry
   */
  public static List<String> parse(String raw) {
    if (raw == null || raw.isBlank()) {
      return List.of();
    }
    Set<String> origins = new LinkedHashSet<>();
    for (String entry : raw.split(",", -1)) {
      String normalized = normalize(entry.strip());
      if (normalized == null) {
        return List.of();
      }
      origins.add(normalized);
    }
    return origins.size() > MAX_ORIGINS ? List.of() : List.copyOf(origins);
  }

  private static String normalize(String candidate) {
    if (candidate.isEmpty() || candidate.length() > MAX_ORIGIN_LENGTH) {
      return null;
    }
    URI uri;
    try {
      uri = new URI(candidate);
    } catch (URISyntaxException e) {
      return null;
    }
    String scheme = uri.getScheme() == null ? null : uri.getScheme().toLowerCase(Locale.ROOT);
    if (!"http".equals(scheme) && !"https".equals(scheme)) {
      return null;
    }
    String path = uri.getRawPath();
    boolean hasPath = path != null && !path.isEmpty() && !"/".equals(path);
    if (uri.getRawUserInfo() != null
        || uri.getRawQuery() != null
        || uri.getRawFragment() != null
        || hasPath) {
      return null;
    }
    String host = uri.getHost();
    if (host == null || host.isEmpty()) {
      return null;
    }
    int port = uri.getPort();
    if (port == 0 || port > 65_535) {
      return null;
    }
    int defaultPort = "https".equals(scheme) ? 443 : 80;
    String authority = host.toLowerCase(Locale.ROOT);
    if (port != -1 && port != defaultPort) {
      authority = authority + ':' + port;
    }
    return scheme + "://" + authority;
  }
}
