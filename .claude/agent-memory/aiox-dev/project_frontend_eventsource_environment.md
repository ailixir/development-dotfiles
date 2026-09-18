---
name: frontend-eventsource-environment
description: Neither jsdom nor Node gives you a global EventSource by default, and running Node's inside jsdom collides on the Event class — measured on the 10.11b worktree
metadata:
  type: project
---

Proving SSE delivery in this frontend needs a real `EventSource`, and the test environment supplies
none. Measured on the story 10.11b worktree (Node v23.10.0, jsdom 23.2.0, vitest 1.6.1), not
inferred:

- `new JSDOM('').window.EventSource` is `undefined`. jsdom has never implemented it.
- `typeof EventSource` inside a `@vitest-environment node` file is **also** `undefined`. Node ships
  one, but only behind `--experimental-eventsource`.
- `process.allowedNodeEnvironmentFlags.has('--experimental-eventsource')` is the safe way to decide
  whether to pass it, so a Node that predates the flag (or unflags the global) still starts.

**Why:** story 10.11b's AC-9 required the *production* transport module as the client over a real
chunked `text/event-stream`. A polyfill or a re-implemented parser would have voided the criterion,
and adding a dependency was explicitly reserved to @po.

**How to apply:**

- In `frontend/vitest.config.ts`, `poolMatchGlobs` routes `**/*.node.test.ts(x)` to the `forks`
  pool and `poolOptions.forks.execArgv` carries the flag. The forks pool is required — worker
  threads reject process-level flags in `execArgv`.
- A `@vitest-environment jsdom` file placed in that same pool gets **both** a DOM and the platform
  `EventSource`, which is what lets a React component test drive a real socket. That combination is
  the only way to count stream connections at a real server from a component test.
- `src/test/setup.ts` touches `window` unguarded, so any `node`-environment file needs the guard
  that is now there. Same for the `401` handler in `src/services/api/apiClient.ts`.
- **The collision to expect:** Node's `EventSource` dispatches into Node's `EventTarget`, which
  validates `instanceof` against *Node's* `Event`, while vitest's jsdom environment has replaced
  `globalThis.Event` with jsdom's. The result is the unhelpful
  `TypeError: The "event" argument must be an instance of Event. Received an instance of Event`,
  thrown from a microtask, which fails the whole file. Recover Node's class with a
  `node:worker_threads` `MessageChannel` round-trip — `Object.getPrototypeOf(deliveredEvent.constructor)`
  is Node's `Event` — and assign it to `globalThis.Event` only. `window.Event` stays jsdom's, so
  jsdom's own dispatching is unaffected. A browser has one `Event` class, so this cannot mask a
  product defect.

Related: [[epic10-falsification-standard]], [[frontend-baseline-environment]].
