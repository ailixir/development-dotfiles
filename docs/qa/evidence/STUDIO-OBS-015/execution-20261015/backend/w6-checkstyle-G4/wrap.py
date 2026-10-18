#!/usr/bin/env python3
"""Split over-long string literals flagged by checkstyle LineLength with `+`.
usage: wrap.py checkstyle.xml  (cwd = repo root)"""
import re, sys

LIM = 118  # target, below the 120 limit, so gjf reindent drift does not re-trip it


def literal_spans(line):
    spans = []
    i = 0
    n = len(line)
    while i < n:
        c = line[i]
        if c == '"':
            j = i + 1
            while line[j] != '"':
                j += 2 if line[j] == "\\" else 1
            spans.append((i, j))  # inclusive indices of quotes
            i = j + 1
        elif c == "'":
            j = i + 1
            while line[j] != "'":
                j += 2 if line[j] == "\\" else 1
            i = j + 1
        elif line.startswith("//", i):
            break
        else:
            i += 1
    return spans


def split_line(line, report):
    if len(line) <= LIM:
        return [line]
    spans = literal_spans(line)
    # literal whose end crosses LIM
    cand = [s for s in spans if s[1] >= LIM - 1]
    if not cand:
        report.append(("no literal crosses limit", line.strip()[:100]))
        return [line]
    a, b = cand[0]
    # split index s: position of a space inside literal, s <= LIM-1 (first part = line[:s] + '"')
    s = None
    for k in range(min(LIM - 1, b - 1), a + 1, -1):
        if line[k] == " " and line[k - 1] != "\\":
            s = k
            break
    if s is None or s <= a + 8:
        # fallback: split on an escape-safe boundary, preferably right after a comma
        bounds = []
        k = a + 1
        while k < b:
            bounds.append(k)
            k += 2 if line[k] == "\\" else 1
        ok = [k for k in bounds if k <= LIM - 1 and k > a + 8]
        pref = [k for k in ok if line[k - 1] in ",("]
        s = (pref or ok or [None])[-1]
    if s is None or s <= a + 8:
        report.append(("no split point", line.strip()[:100]))
        return [line]
    after = line[b + 1 :].lstrip()
    if after.startswith("."):
        report.append(("literal followed by '.' (needs parens)", line.strip()[:100]))
        return [line]
    indent = len(line) - len(line.lstrip())
    rest = " " * (indent + 4) + '+ "' + line[s : ]
    return [line[:s] + '"'] + split_line(rest, report)


def main(xml):
    x = open(xml).read()
    report = []
    for name, body in re.findall(r'<file name="([^"]+)">(.*?)</file>', x, re.S):
        bad = sorted({int(l) for l in re.findall(r'<error line="(\d+)"[^>]*LineLengthCheck', body)})
        if not bad:
            continue
        lines = open(name).read().split("\n")
        out = []
        for idx, ln in enumerate(lines, 1):
            if idx in bad:
                out.extend(split_line(ln, report))
            else:
                out.append(ln)
        open(name, "w").write("\n".join(out))
        print(name.split("/")[-1], len(bad))
    for r in report:
        print("REPORT", r)


if __name__ == "__main__":
    main(sys.argv[1])
