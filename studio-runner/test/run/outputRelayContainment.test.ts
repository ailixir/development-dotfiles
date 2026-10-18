/**
 * STUDIO-OBS-012A — the relay's drop notice is contained like every other delivery.
 *
 * `close()` is documented as never throwing; it runs on the child-exit path. `outputRelay.test.ts`
 * proves the notice is emitted; this proves a sink that throws *on the notice* cannot turn close()
 * into a throw, and that the notice is still attempted exactly once.
 */
import { expect, it } from 'vitest';

import { createRedactor } from '../../src/executor/redaction.js';
import { createOutputRelay } from '../../src/run/outputRelay.js';

it('close() survives a sink that throws on the truncation notice, and attempts it once', () => {
  const delivered: string[] = [];
  let noticeAttempts = 0;
  const relay = createOutputRelay({
    redactor: createRedactor([]),
    maxLineLength: 200,
    maxLines: 2,
    emit: (_stream, line) => {
      if (line.startsWith('[child output truncated')) {
        noticeAttempts += 1;
        throw new Error('log sink closed');
      }
      delivered.push(line);
    },
  });
  for (let index = 0; index < 5; index += 1) relay.write('stdout', `line ${String(index)}\n`);
  expect(() => { relay.close(); }).not.toThrow();
  expect(delivered).toEqual(['line 0', 'line 1']);
  expect(relay.dropped).toBe(3);
  expect(noticeAttempts).toBe(1);
  // A second close is not a second notice.
  relay.close();
  expect(noticeAttempts).toBe(1);
});
