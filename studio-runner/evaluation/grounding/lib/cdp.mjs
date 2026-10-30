// CDP helpers shared by every SPK-07 arm: isolated worlds and DOM identity by backendNodeId.
// Identity never touches the DOM: a Playwright-resolved element is parked in a random main-world
// variable, read back by CDP and deleted.
import { randomUUID } from 'node:crypto';

export async function session(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('Runtime.enable');
  return cdp;
}

export async function isolatedWorld(cdp, name = `spk07-${randomUUID()}`) {
  const tree = await cdp.send('Page.getFrameTree');
  const world = await cdp.send('Page.createIsolatedWorld', { frameId: tree.frameTree.frame.id, worldName: name, grantUniveralAccess: false });
  return world.executionContextId;
}

export async function evaluateHandle(cdp, contextId, expression) {
  const result = await cdp.send('Runtime.evaluate', { contextId, expression, returnByValue: false, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`EVAL ${result.exceptionDetails.exception?.description?.split('\n')[0] ?? result.exceptionDetails.text}`);
  return result.result.objectId;
}

export async function call(cdp, objectId, fn, args = [], byValue = true) {
  const result = await cdp.send('Runtime.callFunctionOn', { objectId, functionDeclaration: fn, arguments: args.map(value => ({ value })), returnByValue: byValue, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(`CALL ${result.exceptionDetails.exception?.description?.split('\n')[0] ?? result.exceptionDetails.text}`);
  return byValue ? result.result.value : result.result.objectId;
}

export async function backendNodeId(cdp, objectId) {
  if (!objectId) return null;
  const { node } = await cdp.send('DOM.describeNode', { objectId });
  return node.backendNodeId;
}

/** backendNodeIds of every element a Playwright locator matches, in document order. */
export async function locatorIds(page, cdp, locator) {
  const key = `__spk07_${randomUUID().replaceAll('-', '')}`;
  const count = await locator.evaluateAll((elements, k) => { window[k] = elements; return elements.length; }, key);
  const ids = [];
  for (let index = 0; index < count; index++) {
    const { result } = await cdp.send('Runtime.evaluate', { expression: `window[${JSON.stringify(key)}][${index}]`, returnByValue: false });
    ids.push(await backendNodeId(cdp, result.objectId));
  }
  await cdp.send('Runtime.evaluate', { expression: `delete window[${JSON.stringify(key)}]` });
  return ids;
}
