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
/**
 * `fetch`-backed client. Node's built-in `fetch` is used deliberately: an HTTP client library
 * would be a new production dependency on the component whose dependency closure is the security
 * boundary (AC-22a), and every such library ships retry and redirect behaviour that would have to
 * be switched off correctly forever.
 */
export function createFetchHttpClient() {
    return {
        async send(request) {
            const controller = new AbortController();
            const timer = setTimeout(() => {
                controller.abort('TIMEOUT');
            }, request.timeoutMs);
            try {
                const response = await fetch(request.url, {
                    method: request.method,
                    headers: { ...request.headers },
                    ...(request.method === 'GET' ? {} : { body: request.body }),
                    // Never turn a refusal into a second POST somewhere else (AC-9).
                    redirect: 'manual',
                    signal: controller.signal,
                });
                let body;
                if (request.maxResponseBytes === undefined)
                    body = await response.text();
                else {
                    const max = request.maxResponseBytes;
                    if (!Number.isSafeInteger(max) || max < 0)
                        throw new Error('RESPONSE_BOUND_INVALID');
                    const reader = response.body?.getReader();
                    const chunks = [];
                    let size = 0;
                    try {
                        if (reader)
                            for (;;) {
                                const next = await reader.read();
                                if (next.done)
                                    break;
                                size += next.value.byteLength;
                                if (size > max) {
                                    await reader.cancel().catch(() => undefined);
                                    throw new Error('RESPONSE_TOO_LARGE');
                                }
                                chunks.push(next.value);
                            }
                        const bytes = new Uint8Array(size);
                        let offset = 0;
                        for (const chunk of chunks) {
                            bytes.set(chunk, offset);
                            offset += chunk.byteLength;
                        }
                        body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
                    }
                    catch {
                        controller.abort();
                        throw new Error('RESPONSE_REFUSED');
                    }
                    finally {
                        reader?.releaseLock();
                    }
                }
                return { kind: 'response', status: response.status, body };
            }
            catch (error) {
                // The only thing that aborts this controller is the timer above, so an aborted signal
                // means the deadline passed rather than that the peer refused.
                if (controller.signal.reason === 'TIMEOUT')
                    return { kind: 'timeout' };
                return {
                    kind: 'transport',
                    reason: error instanceof Error ? error.name : 'unknown',
                };
            }
            finally {
                clearTimeout(timer);
            }
        },
    };
}
//# sourceMappingURL=httpClient.js.map