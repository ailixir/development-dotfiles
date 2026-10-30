// SPK-07 arm A0: today's production collector with PRODUCTION limits (nodes 500, depth 8, bytes 32768, milliseconds 50;
// workLimits elements 4096, depth 64), observationReadProfile(['*']), allowedDomains ['*'] (mirrors allow-all).
// The options go through the production `observationOptions` normaliser. When the collector empties the observation (budget),
// meta.emptied is true and the orchestrator makes NO model call (that is what the product's observation would be worth).
import { loadProduction } from '../collectorInstrumented.mjs';
import { baseConfig, buildNextAction, interpretNextAction, observeWithOptions, productionVerify } from './A1.mjs';

export const id = 'A0';

export async function observe({ cdp, task, step }) {
  const { observationOptions } = await loadProduction();
  const options = observationOptions(await baseConfig()); // fills the production defaults and enforces their ceilings
  return observeWithOptions({ cdp, task, step, options });
}
export function buildRequest(args) { return buildNextAction({ ...args, system: args.observed.system }); }
export async function interpret({ reply, observed }) { return interpretNextAction({ reply, observed, verify: productionVerify(observed) }); }
