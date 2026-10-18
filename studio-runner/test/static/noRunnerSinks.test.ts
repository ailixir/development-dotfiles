import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { expect, it } from 'vitest';

async function sources(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await sources(path));
    else if (entry.name.endsWith('.ts')) result.push(path);
  }
  return result;
}
it('keeps recording diagnostics absent from every production runner module', async () => {
  for (const path of await sources(resolve('src'))) {
    const source = await readFile(path, 'utf8');
    for (const forbidden of [/tracing\s*\.\s*start/u, /recordHar/u, /\.on\s*\(\s*['"]console['"]/u, /\.screenshot\s*\(/u]) expect(source, path).not.toMatch(forbidden);
  }
});
it('defines password candidate count and resolution once inside the isolated collector', async () => {
  const collector = await readFile(resolve('src/run/observationCollector.ts'), 'utf8');
  expect(collector.match(/const passwordCandidates\s*=/gu)).toHaveLength(1);
  expect(collector).toContain('passwordControls: passwordCandidates().length');
  expect(collector).toContain('const candidates = passwordCandidates()');
  for (const path of await sources(resolve('src'))) expect(await readFile(path, 'utf8'), path).not.toMatch(/querySelectorAll\s*\(\s*['"]input\[type\s*=\s*['"]?password/u);
  for (const path of await sources(resolve('src'))) expect(await readFile(path, 'utf8'), path).not.toMatch(/observedAccountContext|\.addCookies\s*\(/u);
});
