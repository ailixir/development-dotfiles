#!/usr/bin/env python3
"""T0-DEV item 3, last v1 re-check: method length by brace counting (claim, checkCommand, largest methods).

The proposal (t0-prep-20261018/t0-proposal.md 2.3) names the result but does not carry the script text, so this is a
fresh brace counter: it skips string literals, text blocks, char literals and comments, and finds a method by its
declaration line (modifiers + return type + name + '(' ... ')' ... '{'). Lambdas inside a method are counted in it.
Run: python3 -I item3_bracecount.py
"""
import re
import sys

ROOT = "/Users/brunobuger/orca/workspaces/put-checks/ui-studio/backend/src/main/java/com/citi/put/checks/studio/guided/"
FILES = {
    "GuidedSessionService": ROOT + "session/GuidedSessionService.java",
    "GuidedTranslationService": ROOT + "translation/GuidedTranslationService.java",
}


def mask(src):
    """Return src with comments / strings / chars / text blocks replaced by spaces (newlines kept)."""
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        two = src[i:i + 2]
        if two == "//":
            j = src.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i)); i = j
        elif two == "/*":
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append("".join(ch if ch == "\n" else " " for ch in src[i:j])); i = j
        elif src.startswith('"""', i):
            j = src.find('"""', i + 3)
            j = n if j < 0 else j + 3
            out.append("".join(ch if ch == "\n" else " " for ch in src[i:j])); i = j
        elif c == '"':
            j = i + 1
            while j < n and src[j] != '"':
                j += 2 if src[j] == "\\" else 1
            j = min(n, j + 1)
            out.append(" " * (j - i)); i = j
        elif c == "'":
            j = i + 1
            while j < n and src[j] != "'":
                j += 2 if src[j] == "\\" else 1
            j = min(n, j + 1)
            out.append(" " * (j - i)); i = j
        else:
            out.append(c); i += 1
    return "".join(out)


DECL = re.compile(
    r"^[ \t]*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:public|protected|private|static|final|synchronized|abstract)\s+)*"
    r"(?:<[^>]+>\s+)?[\w.<>\[\],? ]+?\s+(\w+)\s*\(", re.M)


def methods(path):
    raw = open(path, encoding="utf-8").read()
    m = mask(raw)
    lines_start = [0]
    for k, ch in enumerate(m):
        if ch == "\n":
            lines_start.append(k + 1)

    def lineno(pos):
        lo, hi = 0, len(lines_start) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if lines_start[mid] <= pos:
                lo = mid
            else:
                hi = mid - 1
        return lo + 1

    res = []
    for d in DECL.finditer(m):
        name = d.group(1)
        if name in ("if", "for", "while", "switch", "catch", "return", "new", "synchronized", "try", "else"):
            continue
        # find the parameter list end, then expect '{' (skip 'throws X')
        depth, p = 0, d.end() - 1
        while p < len(m):
            if m[p] == "(":
                depth += 1
            elif m[p] == ")":
                depth -= 1
                if depth == 0:
                    break
            p += 1
        q = p + 1
        tail = re.match(r"\s*(?:throws\s+[\w.,\s]+)?\s*\{", m[q:q + 200])
        if not tail:
            continue
        b = q + tail.end() - 1
        depth, e = 0, b
        while e < len(m):
            if m[e] == "{":
                depth += 1
            elif m[e] == "}":
                depth -= 1
                if depth == 0:
                    break
            e += 1
        start = lineno(d.start())
        # include annotation / javadoc? no: declaration line to closing brace
        res.append((name, start, lineno(e), lineno(e) - start + 1))
    return res


ok = True
for cls, path in FILES.items():
    ms = methods(path)
    print("==", cls, "methods found:", len(ms))
    for name in ("claim", "checkCommand"):
        for m in [x for x in ms if x[0] == name]:
            print("   %-14s :%d-%d  %d lines" % m)
    top = sorted(ms, key=lambda x: -x[3])[:5]
    print("   largest 5:", ", ".join("%s %d (:%d)" % (t[0], t[3], t[1]) for t in top))
