#!/usr/bin/env python3
"""Insert braces around unbraced if/for/while/else bodies flagged by checkstyle NeedBraces.
usage: braces.py checkstyle.xml  (only files in g4.files are touched)"""
import re, sys, html

def lines_offsets(t):
    offs = [0]
    for m in re.finditer("\n", t):
        offs.append(m.end())
    return offs

def skip_ws_comments(t, i):
    n = len(t)
    while i < n:
        if t[i].isspace():
            i += 1
        elif t.startswith("//", i):
            j = t.find("\n", i)
            i = n if j < 0 else j + 1
        elif t.startswith("/*", i):
            j = t.find("*/", i + 2)
            i = j + 2
        else:
            break
    return i

def skip_literal(t, i):
    """if t[i] starts a string/char/text block return index after it, else i"""
    if t.startswith('"""', i):
        j = i + 3
        while True:
            if t[j] == "\\":
                j += 2
            elif t.startswith('"""', j):
                return j + 3
            else:
                j += 1
    if t[i] == '"' or t[i] == "'":
        q = t[i]
        j = i + 1
        while t[j] != q:
            j += 2 if t[j] == "\\" else 1
        return j + 1
    return i

def match_close(t, i):
    """t[i] is an opening bracket; return index after the matching closing bracket"""
    pairs = {"(": ")", "[": "]", "{": "}"}
    stack = [pairs[t[i]]]
    j = i + 1
    while stack:
        j2 = skip_ws_comments(t, j)
        if j2 != j:
            j = j2
            continue
        k = skip_literal(t, j)
        if k != j:
            j = k
            continue
        c = t[j]
        if c in pairs:
            stack.append(pairs[c])
        elif c == stack[-1]:
            stack.pop()
        j += 1
    return j

def word_at(t, i):
    m = re.match(r"[A-Za-z_]+", t[i:i + 12])
    return m.group(0) if m else ""

def stmt_end(t, i):
    """index after the statement starting at i (i at first token)"""
    i = skip_ws_comments(t, i)
    if t[i] == "{":
        return match_close(t, i)
    w = word_at(t, i)
    if w in ("if", "for", "while"):
        j = skip_ws_comments(t, i + len(w))
        assert t[j] == "(", (w, t[i:i + 40])
        j = match_close(t, j)
        e = stmt_end(t, j)
        if w == "if":
            k = skip_ws_comments(t, e)
            if word_at(t, k) == "else":
                e = stmt_end(t, k + 4)
        return e
    if w in ("do", "try", "switch", "synchronized"):
        raise SystemExit("unsupported nested %s at %r" % (w, t[i:i + 40]))
    j = i
    while True:
        j2 = skip_ws_comments(t, j)
        if j2 != j:
            j = j2
            continue
        k = skip_literal(t, j)
        if k != j:
            j = k
            continue
        c = t[j]
        if c in "([{":
            j = match_close(t, j)
            continue
        if c == ";":
            return j + 1
        j += 1

def main(xml, files):
    x = open(xml).read()
    for name, body in re.findall(r'<file name="([^"]+)">(.*?)</file>', x, re.S):
        if not any(name.endswith(f) for f in files):
            continue
        t = open(name).read()
        offs = lines_offsets(t)
        ins = []  # (pos, text)
        for l, c, msg in re.findall(r'<error line="(\d+)" column="(\d+)"[^>]*message="([^"]*)"[^>]*NeedBracesCheck', body):
            kw = re.search(r"&apos;(\w+)&apos;", msg).group(1)
            p = offs[int(l) - 1] + int(c) - 1
            assert t.startswith(kw, p), (name, l, c, kw, t[p:p + 20])
            if kw == "else":
                b = skip_ws_comments(t, p + 4)
            else:
                j = skip_ws_comments(t, p + len(kw))
                assert t[j] == "("
                b = skip_ws_comments(t, match_close(t, j))
            assert t[b] != "{"
            e = stmt_end(t, b)
            ins.append((b, "{ "))
            ins.append((e, " }"))
        # apply from the end; at equal positions keep "}" before... all closers/openers distinct pos or closers only
        for pos, s in sorted(ins, key=lambda a: a[0], reverse=True):
            t = t[:pos] + s + t[pos:]
        open(name, "w").write(t)
        print(name, len(ins) // 2)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
