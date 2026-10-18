#!/usr/bin/env python3
"""REL-001 repro: Chrome for Testing spawn -> UI-ready (and exit) times from the macOS unified log.

    chrome-ready-times.py "2026-10-16 20:25:58" "2026-10-16 20:27:12"

Reproduces the attempt03 measurement: the marker is the distnoted registration with token 3900000038
(Chrome UI init). Use the window printed by tally.mjs for a mode. Read-only; `log show` over a long
window is slow, so run it per mode. Outliers are flagged at 3x the median.
"""
import re, statistics, subprocess, sys

def run(start, end, predicate):
    return subprocess.run(["/usr/bin/log", "show", "--start", start, "--end", end, "--style", "compact", "--predicate", predicate],
                          capture_output=True, text=True, check=False).stdout.splitlines()

def secs(hms):
    h, m, s = hms.split(":"); return int(h) * 3600 + int(m) * 60 + float(s)

if len(sys.argv) != 3:
    sys.exit(__doc__)
start, end = sys.argv[1], sys.argv[2]
spawn, mark, exit_ = {}, {}, {}
for l in run(start, end, '(eventMessage CONTAINS "anon<Google Chrome for Testing>") AND (eventMessage CONTAINS "Now tracking" OR eventMessage CONTAINS "termination reported")'):
    m = re.match(r"\S+ (\S+) .*Now tracking process: \[anon<Google Chrome for Testing>\(501\):(\d+)\]", l)
    if m: spawn[m.group(2)] = secs(m.group(1))
    m = re.match(r"\S+ (\S+) .*\[anon<Google Chrome for Testing>\(501\):(\d+)\] termination reported", l)
    if m: exit_[m.group(2)] = secs(m.group(1))
for l in run(start, end, 'eventMessage CONTAINS "token: 3900000038 pid:"'):
    m = re.match(r"\S+ (\S+) .*token: 3900000038 pid: (\d+)", l)
    if m: mark[m.group(2)] = secs(m.group(1))
rows = sorted((spawn[p], p, mark[p] - spawn[p], (exit_[p] - spawn[p]) if p in exit_ else None) for p in spawn if p in mark)
if not rows:
    sys.exit("no Chrome launches found in the window")
med = statistics.median(r[2] for r in rows)
print(f"launches: {len(rows)}   spawn->UI-ready median {med:.3f}s  max {max(r[2] for r in rows):.3f}s   (attempt03: others 0.216-0.279s, failing launch 0.887s)")
for t, pid, ready, life in rows:
    flag = "  <-- SLOW (>3x median)" if ready > 3 * med else ""
    print(f"  pid {pid:>6}  ready {ready:6.3f}s  life {('%.3fs' % life) if life else '   -  '}{flag}")
