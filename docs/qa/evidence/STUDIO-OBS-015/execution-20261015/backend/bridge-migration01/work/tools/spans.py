"""Locate @Test method spans in GuidedBridgeIntegrationTest and build the retained-class edit.

usage: python3 -I spans.py <base.java> <ruling.json> <out-old.java> <out-moved-dir>
- out-old.java: base with the 29 MIGRATE+RETIRE methods removed (9 retained methods byte-identical)
  and the ruling's one-line comment edit applied.
- out-moved-dir/<name>.java.txt: the verbatim base text of each of the 16 MIGRATE methods.
"""

import json
import re
import sys

base_path, ruling_path, out_old, out_dir = sys.argv[1:5]
text = open(base_path, encoding="utf-8").read()
lines = text.split("\n")
ruling = json.load(open(ruling_path, encoding="utf-8"))
moved = ruling["disclosure"]["moved"]
retired = ruling["disclosure"]["retired"]
retained = ruling["disclosure"]["retainedUnchanged"]
assert len(moved) == 16 and len(retired) == 13 and len(retained) == 9

spans = {}
i = 0
while i < len(lines):
    if lines[i].strip() == "@Test":
        start = i
        j = i + 1
        while "(" not in lines[j]:
            j += 1
        name = re.search(r"void\s+(\w+)\s*\(", lines[j] + (lines[j + 1] if j + 1 < len(lines) else ""))
        assert name, lines[j]
        depth = 0
        seen = False
        k = j
        while True:
            for ch in lines[k]:
                if ch == "{":
                    depth += 1
                    seen = True
                elif ch == "}":
                    depth -= 1
            if seen and depth == 0:
                break
            k += 1
        spans[name.group(1)] = (start, k)
        i = k + 1
    else:
        i += 1

assert set(spans) == set(moved) | set(retired) | set(retained), sorted(set(spans) ^ (set(moved) | set(retired) | set(retained)))
print("tests:", len(spans))

for name in moved:
    s, e = spans[name]
    open(f"{out_dir}/{name}.java.txt", "w", encoding="utf-8").write("\n".join(lines[s : e + 1]) + "\n")

remove = set()
for name in moved + retired:
    s, e = spans[name]
    remove.update(range(s, e + 1))
    # the single blank separator line that follows each method
    if e + 1 < len(lines) and lines[e + 1].strip() == "":
        remove.add(e + 1)

# Static guard (ruling §4.5): no "admissions" post expects 202 in this class. The positive admit
# helper (base :2873-2881) has no remaining caller once the 29 cases leave, so it goes too.
assert lines[2872] == "  JsonNode admit(String id, JsonNode proposal) throws Exception {", lines[2872]
assert lines[2880] == "  }" and lines[2881] == ""
remove.update(range(2872, 2882))

old_comment ="    // Single path: every production start initializes translation state (GuidedProductionSessionAccess)."
new_comment = (
    "    // Fixture stand-in for GuidedProductionSessionAccess.initialize: same rows, hand manifest, no"
    "\n    // acquisition marker; no case here plans or admits."
)
assert lines[2758] == old_comment, lines[2758]
kept = []
for n, line in enumerate(lines):
    if n in remove:
        continue
    kept.append(new_comment if n == 2758 else line)
open(out_old, "w", encoding="utf-8").write("\n".join(kept))
print("removed lines:", len(remove))
for name in retained:
    s, e = spans[name]
    print("retained", name, s + 1, e + 1)
