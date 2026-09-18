package com.citi.put.checks.corun;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * The page the co-run's passing test is run against: one button, served from this JVM on loopback.
 *
 * <p>It exists so that leg 4's verdict depends on the product and nothing else. A public URL would
 * make a red run ambiguous between "the execution path is broken" and "this laptop is offline"; a
 * page served here, on {@link CoRunEnvironment#HOST}, is reachable whenever the harness is.
 *
 * <p>The request count is exposed because a {@code PASSED} verdict with zero requests would mean
 * the browser never loaded the page, and that is a verdict the harness must not accept.
 */
final class FixturePage implements AutoCloseable {

  static final String HTML =
      "<!doctype html><html><head><title>Co-run fixture</title></head>"
          + "<body><main><h1>Co-run fixture</h1><button type=\"button\">Submit</button></main>"
          + "</body></html>";

  private final HttpServer server;
  private final AtomicInteger requests = new AtomicInteger();

  private FixturePage(HttpServer server) {
    this.server = server;
  }

  static FixturePage start() {
    HttpServer server;
    try {
      server =
          HttpServer.create(
              new InetSocketAddress(InetAddress.getByName(CoRunEnvironment.HOST), 0), 0);
    } catch (IOException e) {
      throw new UncheckedIOException("The co-run could not start its fixture page", e);
    }
    FixturePage page = new FixturePage(server);
    server.createContext(
        "/",
        exchange -> {
          page.requests.incrementAndGet();
          byte[] body =
              "/".equals(exchange.getRequestURI().getPath())
                  ? HTML.getBytes(StandardCharsets.UTF_8)
                  : new byte[0];
          int status = body.length == 0 ? 404 : 200;
          exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
          exchange.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
          try (OutputStream out = exchange.getResponseBody()) {
            out.write(body);
          }
        });
    server.start();
    return page;
  }

  String url() {
    return "http://" + CoRunEnvironment.HOST + ":" + server.getAddress().getPort() + "/";
  }

  int requests() {
    return requests.get();
  }

  @Override
  public void close() {
    server.stop(0);
  }
}
