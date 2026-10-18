package com.citi.put.checks.config;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ProtocolFamily;
import java.net.StandardProtocolFamily;
import java.net.StandardSocketOptions;
import java.nio.channels.ServerSocketChannel;
import java.util.concurrent.ThreadLocalRandom;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile("local")
public class LocalEmbeddedPostgresConfig {

  private static final Logger LOGGER = LoggerFactory.getLogger(LocalEmbeddedPostgresConfig.class);

  /**
   * Port range for the embedded server: below every OS ephemeral range (Linux 32768+, macOS/IANA
   * 49152+), so no kernel port-0 allocation (Docker-published ports, Tomcat {@code server.port=0},
   * test HTTP servers) can ever be handed a port this server holds.
   */
  static final int FIRST_PORT = 20000;

  static final int LAST_PORT = 32767;

  private static final int MAX_PORT_ATTEMPTS = 200;

  @Bean(destroyMethod = "close")
  public EmbeddedPostgres embeddedPostgres() throws IOException {
    // The downloaded Darwin x86_64 binaries may run under Rosetta on ARM and reject the host's
    // otherwise valid UTF-8 locale. `C` is portable, while database encoding remains UTF-8.
    EmbeddedPostgres instance =
        EmbeddedPostgres.builder().setLocaleConfig("locale", "C").setPort(choosePort()).start();
    LOGGER.info(
        "Zonky embedded PostgreSQL started on port {} — jdbc url: {}",
        instance.getPort(),
        instance.getJdbcUrl("postgres", "postgres"));
    return instance;
  }

  /**
   * Zonky's default port detection takes a kernel ephemeral port from a dual-stack wildcard socket.
   * On macOS that allocator returns ports another process holds on one specific loopback address
   * (an IPv4-only 127.0.0.1 listener), so the postmaster binds only ::1 and every connection to
   * {@code localhost} reaches the other process. Conversely, a postmaster bound to localhost:P
   * shadows any wildcard listener on P for loopback clients. Pick a port outside the ephemeral
   * ranges and require that both loopback addresses PostgreSQL's default {@code
   * listen_addresses=localhost} binds are exclusively free.
   */
  static int choosePort() throws IOException {
    // Numeric literals: no name resolution happens.
    InetAddress ipv4 = InetAddress.getByName("127.0.0.1");
    InetAddress ipv6 = InetAddress.getByName("::1");
    boolean ipv6Loopback = exclusivelyFree(ipv6, 0);
    for (int attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
      int port = ThreadLocalRandom.current().nextInt(FIRST_PORT, LAST_PORT + 1);
      if (exclusivelyFree(ipv4, port) && (!ipv6Loopback || exclusivelyFree(ipv6, port))) {
        return port;
      }
    }
    throw new IOException(
        "No exclusively free loopback port for embedded PostgreSQL in "
            + FIRST_PORT
            + "-"
            + LAST_PORT);
  }

  /** Binds without SO_REUSEADDR, so any wildcard or same-address holder of the port refuses it. */
  static boolean exclusivelyFree(InetAddress address, int port) {
    ProtocolFamily family =
        address.getAddress().length == 4
            ? StandardProtocolFamily.INET
            : StandardProtocolFamily.INET6;
    try (ServerSocketChannel probe = ServerSocketChannel.open(family)) {
      probe.setOption(StandardSocketOptions.SO_REUSEADDR, false);
      probe.bind(new InetSocketAddress(address, port));
      return true;
    } catch (IOException | UnsupportedOperationException unavailable) {
      return false;
    }
  }

  @Bean
  @Primary
  public DataSource dataSource(EmbeddedPostgres embeddedPostgres) {
    return embeddedPostgres.getPostgresDatabase();
  }
}
