/**
 * A loopback route that accepts the connection and then answers nothing, ever.
 *
 * Moved out of `test/fixtures-tier/deadline-cleanup.test.ts` so the cancel tier can use the same
 * hang (Studio v1 WP11). Not `node:net`: a real HTTP request that is never answered is what makes
 * `page.goto` hang *inside Chromium* rather than fail fast on a refused connection.
 */
import { createServer } from 'node:http';
import type { Server } from 'node:http';

export interface BlackHole {
  readonly server: Server;
  /** A URL whose navigation never settles. */
  readonly url: string;
  close(): Promise<void>;
}

export function startBlackHole(): Promise<BlackHole> {
  return new Promise((resolve) => {
    const instance = createServer(() => {
      // Deliberately no `response.end`. The socket stays open and the navigation never settles.
    });
    instance.listen(0, '127.0.0.1', () => {
      const address = instance.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolve({
        server: instance,
        url: `http://127.0.0.1:${String(port)}/never`,
        close(): Promise<void> {
          // The hung sockets would otherwise keep `close` waiting for ever.
          instance.closeAllConnections();
          return new Promise<void>((done) => {
            instance.close(() => {
              done();
            });
          });
        },
      });
    });
  });
}
