/**
 * The HTTP server itself (AC-1, AC-12, ADR-001 §5).
 *
 * **`node:http`, deliberately.** ADR-001 §5 leaves the HTTP server choice to this story and
 * requires it to be minimal and pinned. The route surface is four routes with no middleware, no
 * content negotiation and no templating. Node's built-in server covers it with **zero new
 * production dependencies**, which keeps the resolved production closure at `playwright`,
 * `playwright-core` and `typescript` — the allowlist AC-22a asserts. Adding a framework here
 * would put a transitive tree of unaudited packages inside the one process in the system that
 * renders untrusted web pages, to save writing a `switch` on `method` and `path`.
 *
 * The drain path is the reason `close` takes two steps. Flipping readiness and refusing new work
 * happens immediately; actually closing the listener happens only after the in-flight run has
 * delivered its terminal report or its deadline has passed. A process that exits between the two
 * abandons an admitted attempt, which is the failure mode AC-12 exists to prevent.
 */
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { RouteOptions } from './routes.js';
import { createRequestHandler } from './routes.js';

export interface RunnerServer {
  listen(port: number, host: string): Promise<number>;
  /** Stops accepting connections and resolves when open ones have finished. */
  close(): Promise<void>;
  /** Bound port; `0` before `listen` resolves. */
  readonly port: number;
  readonly raw: Server;
}

export function createRunnerServer(options: RouteOptions): RunnerServer {
  const handler = createRequestHandler(options);
  const server = createServer((request, response) => {
    handler(request, response);
  });
  let port = 0;

  return {
    raw: server,
    get port(): number {
      return port;
    },
    listen(requested: number, host: string): Promise<number> {
      return new Promise<number>((resolve, reject) => {
        const onError = (error: Error): void => {
          reject(error);
        };
        server.once('error', onError);
        server.listen(requested, host, () => {
          server.removeListener('error', onError);
          const address = server.address();
          port = typeof address === 'object' && address !== null ? (address).port : requested;
          resolve(port);
        });
      });
    },
    close(): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close(() => {
          resolve();
        });
        // Idle keep-alive sockets would otherwise hold the close open past the drain deadline.
        server.closeIdleConnections();
      });
    },
  };
}
