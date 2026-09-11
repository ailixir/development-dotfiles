package com.citi.put.checks.studio.sse;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * An SSE client that reads the socket <b>incrementally</b> (AC-34).
 *
 * <p>The SSE assessment's <i>Validation</i> section says it plainly: "a buffered mock-controller
 * response does not prove SSE delivery". A {@code MockMvc} return value is the object the handler
 * produced, not the bytes a browser received in the order it received them, and it cannot observe
 * that two snapshots arrived as <em>separate events before the response closed</em>, which is the
 * whole property. So this reads the body stream line by line as it arrives and timestamps each
 * frame.
 */
public final class SseTestClient implements AutoCloseable {

  /** One parsed frame, with the wall-clock instant at which its terminating blank line arrived. */
  public record Frame(String id, String event, String data, boolean comment, long receivedAtMs) {}

  private final HttpClient http =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
  private final List<Frame> frames = new CopyOnWriteArrayList<>();
  private final AtomicBoolean closed = new AtomicBoolean(false);
  private volatile HttpResponse<InputStream> response;
  private volatile Thread reader;

  /** Opens the stream and starts reading. Returns the response head immediately. */
  public HttpResponse<InputStream> open(String url, Map<String, String> headers) throws Exception {
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create(url)).header("Accept", "text/event-stream").GET();
    headers.forEach(request::header);
    response = http.send(request.build(), HttpResponse.BodyHandlers.ofInputStream());

    reader =
        new Thread(
            () -> {
              try (BufferedReader lines =
                  new BufferedReader(
                      new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
                String id = null;
                String event = null;
                StringBuilder data = new StringBuilder();
                String line;
                while ((line = lines.readLine()) != null) {
                  if (line.startsWith(":")) {
                    frames.add(
                        new Frame(null, null, line.substring(1), true, System.currentTimeMillis()));
                    continue;
                  }
                  if (line.isEmpty()) {
                    if (id != null || event != null || data.length() > 0) {
                      frames.add(
                          new Frame(id, event, data.toString(), false, System.currentTimeMillis()));
                    }
                    id = null;
                    event = null;
                    data.setLength(0);
                    continue;
                  }
                  if (line.startsWith("id:")) {
                    id = line.substring(3).trim();
                  } else if (line.startsWith("event:")) {
                    event = line.substring(6).trim();
                  } else if (line.startsWith("data:")) {
                    data.append(line.substring(5).trim());
                  }
                }
              } catch (Exception e) {
                // The stream ended; that is a result, not a failure.
              } finally {
                closed.set(true);
              }
            });
    reader.setDaemon(true);
    reader.start();
    return response;
  }

  /** Snapshot frames only, in arrival order. */
  public List<Frame> snapshots() {
    List<Frame> found = new ArrayList<>();
    frames.stream().filter(frame -> !frame.comment()).forEach(found::add);
    return found;
  }

  public List<Frame> heartbeats() {
    List<Frame> found = new ArrayList<>();
    frames.stream().filter(Frame::comment).forEach(found::add);
    return found;
  }

  public boolean isClosed() {
    return closed.get();
  }

  /** Waits until at least {@code count} snapshot frames have arrived, or gives up. */
  public boolean awaitSnapshots(int count, Duration timeout) throws InterruptedException {
    long deadline = System.nanoTime() + timeout.toNanos();
    while (System.nanoTime() < deadline) {
      if (snapshots().size() >= count) {
        return true;
      }
      TimeUnit.MILLISECONDS.sleep(50);
    }
    return snapshots().size() >= count;
  }

  public boolean awaitClosed(Duration timeout) throws InterruptedException {
    long deadline = System.nanoTime() + timeout.toNanos();
    while (System.nanoTime() < deadline) {
      if (closed.get()) {
        return true;
      }
      TimeUnit.MILLISECONDS.sleep(50);
    }
    return closed.get();
  }

  @Override
  public void close() {
    if (reader != null) {
      reader.interrupt();
    }
    if (response != null) {
      try {
        response.body().close();
      } catch (Exception e) {
        // Already closed.
      }
    }
  }
}
