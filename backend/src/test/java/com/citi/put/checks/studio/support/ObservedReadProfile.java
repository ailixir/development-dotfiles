package com.citi.put.checks.studio.support;

import com.citi.put.checks.studio.navigation.AllowedDomains;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * The id the runner's constant read profile gives the visible-text grant of one allowed domain
 * (STUDIO-FLEX-001): one grant per whitelist entry, the id a pure function of the entry, so
 * learning and replay agree on it. It is what a real runner reports on every readable node of a
 * page whose host is under that entry; here the entries are {@link TestDomains#ENTRIES}, which the
 * harness gives the runner.
 */
public final class ObservedReadProfile {
  private ObservedReadProfile() {}

  /** The grant id for the whitelist entry that the page at {@code url} falls under. */
  public static String ruleId(String url) {
    String host = AllowedDomains.hostOf(url);
    for (String entry : TestDomains.ENTRIES) {
      if (host != null && (host.equals(entry) || host.endsWith("." + entry))) {
        return grantId(entry);
      }
    }
    throw new IllegalArgumentException("not under an allowed domain: " + url);
  }

  /**
   * {@code observed-read-v1-} and the SHA-256 of the entry, as the runner's {@code readGrantId}.
   */
  public static String grantId(String entry) {
    try {
      return "observed-read-v1-"
          + HexFormat.of()
              .formatHex(
                  MessageDigest.getInstance("SHA-256")
                      .digest(entry.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException(impossible);
    }
  }
}
