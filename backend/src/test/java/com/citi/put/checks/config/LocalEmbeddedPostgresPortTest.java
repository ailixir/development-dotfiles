package com.citi.put.checks.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import org.junit.jupiter.api.Test;

/** Port selection for the local embedded PostgreSQL (STUDIO-OBS-012A run-4 residual). */
class LocalEmbeddedPostgresPortTest {

  private static InetAddress ipv4Loopback() throws Exception {
    return InetAddress.getByName("127.0.0.1");
  }

  @Test
  void anIpv4OnlyLoopbackListenerMakesThePortUnavailable() throws Exception {
    // What a host desktop client held on 127.0.0.1:49216 during run 4.
    try (ServerSocket holder = new ServerSocket()) {
      holder.bind(new InetSocketAddress(ipv4Loopback(), 0));
      assertThat(LocalEmbeddedPostgresConfig.exclusivelyFree(ipv4Loopback(), holder.getLocalPort()))
          .isFalse();
    }
  }

  @Test
  void aWildcardListenerMakesThePortUnavailable() throws Exception {
    // What a Docker-published port or Tomcat on server.port=0 holds.
    try (ServerSocket holder = new ServerSocket(0)) {
      assertThat(LocalEmbeddedPostgresConfig.exclusivelyFree(ipv4Loopback(), holder.getLocalPort()))
          .isFalse();
    }
  }

  @Test
  void chosenPortIsOutsideEphemeralRangesAndExclusivelyFree() throws Exception {
    int port = LocalEmbeddedPostgresConfig.choosePort();
    assertThat(port)
        .isBetween(LocalEmbeddedPostgresConfig.FIRST_PORT, LocalEmbeddedPostgresConfig.LAST_PORT)
        .isLessThan(32768);
    assertThat(LocalEmbeddedPostgresConfig.exclusivelyFree(ipv4Loopback(), port)).isTrue();
  }
}
