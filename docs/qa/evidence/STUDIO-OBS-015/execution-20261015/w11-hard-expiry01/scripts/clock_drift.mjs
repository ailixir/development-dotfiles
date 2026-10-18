// Samples offset = Date.now() - (performance.timeOrigin + performance.now()) every 50 ms.
const seconds = Number(process.argv[2] ?? 30); const samples = [];
const t0 = performance.now();
const iv = setInterval(() => {
  samples.push({ t: performance.now() - t0, off: Date.now() - (performance.timeOrigin + performance.now()) });
  if (performance.now() - t0 > seconds * 1000) {
    clearInterval(iv);
    const offs = samples.map(s => s.off), min = Math.min(...offs), max = Math.max(...offs);
    // largest change in any 4 s window
    let worst = 0; for (let i = 0; i < samples.length; i++) for (let j = i; j < samples.length && samples[j].t - samples[i].t <= 4000; j++) worst = Math.max(worst, Math.abs(samples[j].off - samples[i].off));
    console.log(JSON.stringify({ seconds, n: samples.length, offsetMinMs: +min.toFixed(3), offsetMaxMs: +max.toFixed(3), offsetRangeMs: +(max - min).toFixed(3), worstChangeWithin4sMs: +worst.toFixed(3) }));
  }
}, 50);
