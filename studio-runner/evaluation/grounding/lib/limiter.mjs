/* eslint-disable -- SPK-07 spike tooling. */
// SPK-07 global adaptive in-flight limiter (4-hour profile, preregistration section 14 entry 6).
// AIMD: start at 6 calls in flight, +1 after every 8 consecutive successes up to 20, halve (floor 2) on each 429/503.
// It wraps vertex.send; vertex.mjs keeps its own retries, so a call that finally returns 429/503 is a throttle event, and a
// call that succeeded only after retries is seen through calls.jsonl (tailThrottles) because every HTTP attempt is logged there.
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';

export const LIMITER_DEFAULTS = Object.freeze({ start: 6, min: 2, max: 20, successesPerStep: 8, minHalveIntervalMs: 5000 });

/** Returns a function that, on each call, counts the 429/503 attempts appended to calls.jsonl since the previous call. */
export function tailThrottles(file) {
  let offset = 0;
  let carry = '';
  return () => {
    if (!existsSync(file)) return 0;
    const size = statSync(file).size;
    if (size <= offset) return 0;
    const fd = openSync(file, 'r');
    const buffer = Buffer.alloc(size - offset);
    try { readSync(fd, buffer, 0, buffer.length, offset); } finally { closeSync(fd); }
    offset = size;
    const lines = (carry + buffer.toString('utf8')).split('\n');
    carry = lines.pop() ?? '';
    let throttled = 0;
    for (const line of lines) {
      if (!line) continue;
      try { const status = JSON.parse(line).status; if (status === 429 || status === 503) throttled++; } catch { /* torn line */ }
    }
    return throttled;
  };
}

export function createLimiter({ start = LIMITER_DEFAULTS.start, min = LIMITER_DEFAULTS.min, max = LIMITER_DEFAULTS.max, successesPerStep = LIMITER_DEFAULTS.successesPerStep,
  minHalveIntervalMs = LIMITER_DEFAULTS.minHalveIntervalMs, now = () => Date.now(), pollThrottles = null, onChange = null } = {}) {
  let limit = start; let inflight = 0; let streak = 0; let lastHalved = -Infinity;
  const waiting = [];
  const stats = { start, min, max, completed: 0, successes: 0, throttledFinal: 0, retriedThrottles: 0, halvings: 0, increases: 0, maxInFlight: 0, minLimit: start, maxLimit: start };
  const change = (reason) => {
    stats.minLimit = Math.min(stats.minLimit, limit); stats.maxLimit = Math.max(stats.maxLimit, limit);
    onChange?.({ t: new Date(now()).toISOString(), limit, inflight, reason, ...stats });
  };
  const halve = (reason) => {
    streak = 0;
    const t = now();
    if (t - lastHalved < minHalveIntervalMs) return; // one halving per congestion window, not one per concurrent 429
    lastHalved = t;
    const next = Math.max(min, Math.floor(limit / 2));
    stats.halvings++;
    if (next !== limit) { limit = next; change(reason); }
  };
  const pump = () => { while (waiting.length > 0 && inflight < limit) { inflight++; stats.maxInFlight = Math.max(stats.maxInFlight, inflight); waiting.shift()(); } };
  const acquire = () => new Promise(resolve => { waiting.push(resolve); pump(); });
  const settle = (result) => {
    stats.completed++;
    const status = result?.status;
    if (status === 200 && result?.reply) {
      stats.successes++; streak++;
      if (streak >= successesPerStep && limit < max) { limit++; streak = 0; stats.increases++; change('success-streak'); }
    } else if (status === 429 || status === 503) { stats.throttledFinal++; halve('final-429/503'); }
    if (pollThrottles) { const n = pollThrottles(); if (n > 0) { stats.retriedThrottles += n; halve(`retry-429/503 x${n}`); } }
  };
  return {
    /** Runs fn (a vertex.send call) once a slot is free; the result's status drives the AIMD. */
    async run(fn) {
      await acquire();
      try { const result = await fn(); settle(result); return result; } catch (error) { throw error; } finally { inflight--; pump(); }
    },
    limit: () => limit,
    inflight: () => inflight,
    stats: () => ({ ...stats, limit, inflight }),
  };
}

export const IMAGE_LANE_DEFAULTS = Object.freeze({ start: 2, min: 1, max: 3, successesPerStep: 8, minHalveIntervalMs: 5000 });
/** S4 sends screenshots; its calls draw far more 429s than text calls, so they get their own lane. */
export const laneOfLabel = label => (/\|S4\|/u.test(String(label ?? '')) ? 'image' : 'text');

/**
 * Like tailThrottles, but attributes each 429/503 attempt in calls.jsonl to a lane by the label's arm. Returns a function
 * (lane) => number of not-yet-consumed throttles of that lane (the file is read once, new lines are shared between lanes).
 */
export function tailThrottlesByLane(file, laneOf = laneOfLabel) {
  let offset = 0; let carry = '';
  const pending = { text: 0, image: 0 };
  const read = () => {
    if (!existsSync(file)) return;
    const size = statSync(file).size;
    if (size <= offset) return;
    const fd = openSync(file, 'r');
    const buffer = Buffer.alloc(size - offset);
    try { readSync(fd, buffer, 0, buffer.length, offset); } finally { closeSync(fd); }
    offset = size;
    const lines = (carry + buffer.toString('utf8')).split('\n');
    carry = lines.pop() ?? '';
    for (const line of lines) {
      if (!line) continue;
      try { const record = JSON.parse(line); if (record.status === 429 || record.status === 503) pending[laneOf(record.label)]++; } catch { /* torn line */ }
    }
  };
  return (lane) => { read(); const n = pending[lane] ?? 0; pending[lane] = 0; return n; };
}

/**
 * Two independent AIMD lanes. The text lane (SOURCE_PLAN, A0, A1, S1, S2, S3) starts at 6 in flight and reacts only to text
 * throttles; the image lane (S4) starts at 2, max 3, floor 1 and reacts only to image throttles.
 */
export function createLanedLimiter({ text = {}, image = {}, pollThrottles = null, onChange = null, laneOf = laneOfLabel } = {}) {
  const lanes = {
    text: createLimiter({ ...text, pollThrottles: pollThrottles ? () => pollThrottles('text') : null, onChange: onChange ? row => onChange({ lane: 'text', ...row }) : null }),
    image: createLimiter({ ...IMAGE_LANE_DEFAULTS, ...image, pollThrottles: pollThrottles ? () => pollThrottles('image') : null, onChange: onChange ? row => onChange({ lane: 'image', ...row }) : null }),
  };
  return {
    lanes,
    run: (fn, label) => lanes[laneOf(label)].run(fn),
    stats: () => ({ text: lanes.text.stats(), image: lanes.image.stats() }),
  };
}

/** A vertex-like object whose send() goes through the limiter (lane chosen from options.label when the limiter has lanes). */
export function limitedVertex(vertex, limiter) {
  return { ...vertex, send: (body, options) => limiter.run(() => vertex.send(body, options), options?.label) };
}
