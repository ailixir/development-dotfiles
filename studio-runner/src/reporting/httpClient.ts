/**
 * The runner's only outbound HTTP seam (AC-3, AC-9, architecture §5.1 closing paragraph).
 *
 * **Automatic retry is not "disabled by configuration" here; it does not exist.** The interface
 * has no retry parameter and the implementation has no retry loop. Retry, where a caller needs it
 * (terminal delivery only — AC-17), is written explicitly at the call site where it can be read
 * and tested. This is deliberate: the admission call and the terminal report have *opposite*
 * retry policies, and a client default would eventually collapse them into one.
 *
 * **Redirects are never followed.** `redirect: 'manual'` means a `307`/`308` comes back as a
 * response with that status instead of silently becoming a second POST to another host. A
 * followed redirect on the admission route is a second admission request wearing a different
 * name, and it is exactly as dangerous as an explicit replay (AC-9).
 *
 * The body crosses this seam as a **string**, already serialized. Callers that must guarantee
 * byte-identical delivery (AC-17) or redacted bytes (AC-20) can only do so if they own the
 * serialization, so the client never serializes anything itself.
 */

export interface HttpRequest {
  readonly url: string;
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  /** Already serialized. The client sends these bytes and no others. */
  readonly body: string;
  readonly timeoutMs: number;
}

export type HttpOutcome =
  | { readonly kind: 'response'; readonly status: number; readonly body: string }
  /** The request was sent but its outcome is unknown: timed out or the connection was lost. */
  | { readonly kind: 'timeout' }
  | { readonly kind: 'transport'; readonly reason: string };

export interface HttpClient {
  /** Issues **exactly one** request. Never retries, never follows a redirect. */
  send(request: HttpRequest): Promise<HttpOutcome>;
}

/**
 * `fetch`-backed client. Node's built-in `fetch` is used deliberately: an HTTP client library
 * would be a new production dependency on the component whose dependency closure is the security
 * boundary (AC-22a), and every such library ships retry and redirect behaviour that would have to
 * be switched off correctly forever.
 */
export function createFetchHttpClient(): HttpClient {
  return {
    async send(request: HttpRequest): Promise<HttpOutcome> {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, request.timeoutMs);
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: { ...request.headers },
          body: request.body,
          // Never turn a refusal into a second POST somewhere else (AC-9).
          redirect: 'manual',
          signal: controller.signal,
        });
        const body = await response.text();
        return { kind: 'response', status: response.status, body };
      } catch (error) {
        // The only thing that aborts this controller is the timer above, so an aborted signal
        // means the deadline passed rather than that the peer refused.
        if (controller.signal.aborted) return { kind: 'timeout' };
        return {
          kind: 'transport',
          reason: error instanceof Error ? error.name : 'unknown',
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
