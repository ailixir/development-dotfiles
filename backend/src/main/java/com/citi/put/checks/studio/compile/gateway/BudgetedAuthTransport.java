package com.citi.put.checks.studio.compile.gateway;

import com.citi.put.checks.studio.compile.CompileBudget;
import com.google.api.client.http.HttpTransport;
import com.google.api.client.http.LowLevelHttpRequest;
import com.google.api.client.http.LowLevelHttpResponse;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.util.function.Supplier;
import okhttp3.Call;
import okhttp3.Headers;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/** Google auth HTTP adapter whose complete connect/write/read lifetime belongs to one compile. */
final class BudgetedAuthTransport extends HttpTransport {
  private static final int MAX_BODY = 1024 * 1024;
  private final Supplier<CompileBudget> budgets;
  private final OkHttpClient http =
      new OkHttpClient.Builder()
          .retryOnConnectionFailure(false)
          .followRedirects(false)
          .followSslRedirects(false)
          .build();

  BudgetedAuthTransport(Supplier<CompileBudget> budgets) {
    this.budgets = budgets;
  }

  @Override
  public boolean supportsMethod(String method) {
    return true;
  }

  @Override
  protected LowLevelHttpRequest buildRequest(String method, String url) {
    return new LowLevelHttpRequest() {
      private final Headers.Builder headers = new Headers.Builder();

      @Override
      public void addHeader(String name, String value) {
        headers.add(name, value);
      }

      @Override
      public LowLevelHttpResponse execute() throws IOException {
        CompileBudget budget = budgets.get();
        if (budget == null) {
          throw new IOException("credential request has no compile budget");
        }
        budget.remaining();
        ByteArrayOutputStream payload = new ByteArrayOutputStream();
        if (getStreamingContent() != null) {
          getStreamingContent().writeTo(payload);
        }
        if (payload.size() > MAX_BODY) {
          throw new IOException("credential request exceeds limit");
        }
        boolean hasBody = !method.equals("GET") && !method.equals("HEAD");
        RequestBody body =
            hasBody
                ? RequestBody.create(
                    payload.toByteArray(),
                    getContentType() == null ? null : MediaType.parse(getContentType()))
                : null;
        Request.Builder request =
            new Request.Builder().url(url).headers(headers.build()).method(method, body);
        if (getContentEncoding() != null) {
          request.header("Content-Encoding", getContentEncoding());
        }
        Duration timeout = budget.cap(Duration.ofSeconds(30));
        Call call = http.newBuilder().callTimeout(timeout).build().newCall(request.build());
        Runnable remove = budget.onCancel(call::cancel);
        try (Response response = call.execute()) {
          byte[] content;
          okhttp3.ResponseBody responseBody = response.body();
          if (responseBody == null) {
            throw new IOException("empty credential response");
          }
          try (InputStream input = responseBody.byteStream()) {
            content = input.readNBytes(MAX_BODY + 1);
          }
          if (content.length > MAX_BODY) {
            throw new IOException("credential response exceeds limit");
          }
          budget.remaining();
          return new BufferedResponse(
              response.code(), response.message(), response.headers(), content);
        } finally {
          remove.run();
        }
      }
    };
  }

  @Override
  public void shutdown() {
    http.dispatcher().cancelAll();
    http.dispatcher().executorService().shutdown();
    http.connectionPool().evictAll();
  }

  private static final class BufferedResponse extends LowLevelHttpResponse {
    private final int code;
    private final String message;
    private final Headers headers;
    private final byte[] bytes;

    private BufferedResponse(int code, String message, Headers headers, byte[] bytes) {
      this.code = code;
      this.message = message;
      this.headers = headers;
      this.bytes = bytes;
    }

    @Override
    public InputStream getContent() {
      return new ByteArrayInputStream(bytes);
    }

    @Override
    public String getContentEncoding() {
      return headers.get("Content-Encoding");
    }

    @Override
    public long getContentLength() {
      return bytes.length;
    }

    @Override
    public String getContentType() {
      return headers.get("Content-Type");
    }

    @Override
    public String getStatusLine() {
      return "HTTP/1.1 " + code + " " + message;
    }

    @Override
    public int getStatusCode() {
      return code;
    }

    @Override
    public String getReasonPhrase() {
      return message;
    }

    @Override
    public int getHeaderCount() {
      return headers.size();
    }

    @Override
    public String getHeaderName(int index) {
      return headers.name(index);
    }

    @Override
    public String getHeaderValue(int index) {
      return headers.value(index);
    }
  }
}
