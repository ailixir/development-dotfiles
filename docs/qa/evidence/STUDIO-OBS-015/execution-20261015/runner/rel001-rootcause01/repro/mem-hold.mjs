#!/usr/bin/env node
// REL-001 repro: bounded memory-pressure holder. Allocates incompressible memory in 64 MB chunks up to
// --gb, keeps a slice of it hot, and backs off if swap is nearly gone or the disk is nearly full. It only
// ever frees its own memory and exits on SIGTERM/SIGINT.
import { execFileSync } from 'node:child_process';
import { randomFillSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({ options: {
  gb: { type: 'string', default: '5' },
  'min-free-swap-gb': { type: 'string', default: '1.5' },
  'min-free-disk-gb': { type: 'string', default: '25' },
  'ready-file': { type: 'string' },
  'chunk-mb': { type: 'string', default: '64' },
} });
const targetGb = Number(a.gb), minSwapGb = Number(a['min-free-swap-gb']), minDiskGb = Number(a['min-free-disk-gb']), chunk = Number(a['chunk-mb']) * 1048576;
if (!(targetGb > 0 && targetGb <= 8)) { console.error('--gb must be in (0, 8]'); process.exit(2); }

function swapFreeGb() {
  // "total = 7168.00M  used = 5904.06M  free = 1263.94M  (encrypted)"
  const m = /free = ([\d.]+)M/.exec(execFileSync('sysctl', ['-n', 'vm.swapusage'], { encoding: 'utf8' }));
  return m ? Number(m[1]) / 1024 : 0;
}
function diskFreeGb() {
  const row = execFileSync('df', ['-k', '/System/Volumes/Data'], { encoding: 'utf8' }).trim().split('\n').at(-1).split(/\s+/);
  return Number(row[3]) / 1048576;
}
const chunks = [];
let stop = false;
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop = true; });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let capped = null;
while (!stop && chunks.length * chunk < targetGb * 1073741824) {
  if (swapFreeGb() < minSwapGb) { capped = 'swap'; break; }
  if (diskFreeGb() < minDiskGb) { capped = 'disk'; break; }
  const b = Buffer.allocUnsafe(chunk); randomFillSync(b); chunks.push(b);
  await sleep(50);
}
const heldGb = (chunks.length * chunk) / 1073741824;
console.error(`mem-hold: holding ${heldGb.toFixed(2)} GB${capped ? ` (capped by ${capped})` : ''}`);
if (a['ready-file']) writeFileSync(a['ready-file'], JSON.stringify({ heldGb, capped, pid: process.pid }) + '\n');

let tick = 0;
while (!stop) {
  await sleep(2000);
  // Keep a slice resident so the pages are not simply compressed away and forgotten.
  for (let i = tick++ % 8; i < chunks.length; i += 8) chunks[i][(Math.random() * chunk) | 0] ^= 1;
  if (swapFreeGb() < minSwapGb / 2) { console.error('mem-hold: swap nearly exhausted, releasing everything'); chunks.length = 0; process.exit(3); }
}
chunks.length = 0;
