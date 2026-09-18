package com.citi.put.checks.corun;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * A page that accepts every request and never answers it (Studio v1 WP12).
 *
 * <p>It is what makes a co-run leg's run <em>live and mid-step</em> for as long as the leg needs:
 * {@code page.goto} to this address blocks inside Chromium, on a real socket, until something ends
 * the run. A refused connection would fail fast, and a slow page would eventually load; only an
 * accepted, unanswered request keeps the navigation pending, which is the shape a cancel has to
 * interrupt. The pattern is the one {@code deadline-cleanup.test.ts} uses in the runner's fixtures
 * tier, served here from the test JVM on loopback so a red leg cannot be a network problem.
 *
 * <p>The request count is the harness's "the browser is now inside the stalled step" signal: the
 * first request arrives only once step 0 has finished and step 1 has begun navigating.
 */
final class BlackHolePage implements AutoCloseable {

  private final HttpServer server;
  private final ExecutorService handlers;
  private final AtomicInteger requests = new AtomicInteger();
  private final CountDownLatch closed = new CountDownLatch(1);

  private BlackHolePage(HttpServer server, ExecutorService handlers) {
    this.server = server;
    this.handlers = handlers;
  }

  static BlackHolePage start() {
    HttpServer server;
    try {
      server =
          HttpServer.create(
              new InetSocketAddress(InetAddress.getByName(CoRunEnvironment.HOST), 0), 0);
    } catch (IOException e) {
      throw new UncheckedIOException("The co-run could not start its black-hole page", e);
    }
    ExecutorService handlers =
        Executors.newCachedThreadPool(
            runnable -> {
              Thread thread = new Thread(runnable, "corun-black-hole");
              thread.setDaemon(true);
              return thread;
            });
    BlackHolePage page = new BlackHolePage(server, handlers);
    server.setExecutor(handlers);
    server.createContext(
        "/",
        exchange -> {
          page.requests.incrementAndGet();
          try {
            // Deliberately no response. The socket stays open and the navigation never settles,
            // until the harness itself closes the page.
            page.closed.await();
          } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
          } finally {
            exchange.close();
          }
        });
    server.start();
    return page;
  }

  String url() {
    return "http://" + CoRunEnvironment.HOST + ":" + server.getAddress().getPort() + "/never";
  }

  int requests() {
    return requests.get();
  }

  @Override
  public void close() {
    closed.countDown();
    server.stop(0);
    handlers.shutdownNow();
  }
}
