import { installDefaultExecutionTransportSeam } from './studioExecutionTransport';
import { createSseTransport } from './studioSseTransport';
import { createPollTransport } from './studioPollTransport';

/**
 * The one place the abstraction is wired to its implementations.
 *
 * Kept out of `studioExecutionTransport.ts` so that the abstraction imports nothing at run time:
 * the implementations import the abstraction's **types only**, and the arrow points one way. A
 * consumer imports this module (or `studioExecutionTransport` via this one) and gets a seam already
 * populated with the product default — `EventSource` primary, bounded GET fallback.
 */
installDefaultExecutionTransportSeam({
  primary: createSseTransport,
  fallback: createPollTransport,
});

export * from './studioExecutionTransport';
export { createSseTransport } from './studioSseTransport';
export { createPollTransport } from './studioPollTransport';
