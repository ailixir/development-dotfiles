// Measures how a Node timer scheduled from `remaining = E - Date.now()` relates to the wall clock
// when it fires, exactly as ownership.ts schedule() / runtime.ts schedule() do.
// Usage: node timer_vs_wall.mjs <trials> <mode>   mode: fresh | busy1 | busy3 | io
const trials = Number(process.argv[2] ?? 2000), mode = process.argv[3] ?? 'fresh';
const busy = ms => { const end = performance.now() + ms; while (performance.now() < end); };
const results = [];
let n = 0;
function run() {
  if (n++ >= trials) return done();
  const go = () => {
    if (mode === 'busy1') busy(1); else if (mode === 'busy3') busy(3);
    const D = 20 + Math.floor(Math.random() * 20);
    const E = Date.now() + D;            // an "absolute deadline" in whole ms, like expiresAt
    const remaining = E - Date.now();    // product: min(lease, expiresAt) - Date.now()
    const m0 = performance.now();
    setTimeout(() => { const now = Date.now(); results.push({ lateMs: now - E, monoMs: performance.now() - m0, remaining }); setImmediate(run); }, Math.max(0, remaining));
  };
  if (mode === 'io') import('node:fs').then(fs => fs.readFile(new URL(import.meta.url), go)); else setTimeout(go, 1 + Math.floor(Math.random() * 3));
}
function done() {
  const hist = {};
  for (const r of results) hist[r.lateMs] = (hist[r.lateMs] ?? 0) + 1;
  const early = results.filter(r => r.lateMs < 0).length;
  console.log(JSON.stringify({ mode, trials: results.length, earlyDateNowBeforeDeadline: early, earlyPct: +(100 * early / results.length).toFixed(2), histLateMs: hist }));
}
run();
