#!/usr/bin/env python3
"""T0-DEV item 5: confirm the 11-FOLD file sets against the tree at S_011 (read-only).

Run (after item1): python3 -I item5_fold_check.py
Question: is every file that must change for the fold (3 class deletions, R-4a one client, R-4b one seam) in a write set
of 11-FOLD-prep / 11-FOLD-final (or of another lane that is ordered before it), and is nothing listed that has no reason?
"""
import json
import os
import re
import sys

ROOT = "/Users/brunobuger/orca/workspaces/put-checks/ui-studio"
T0 = ROOT + "/docs/qa/evidence/STUDIO-OBS-011/t0/early/T0-DEV"
BE = ROOT + "/backend/src"
writesets = json.load(open(T0 + "/item1-writesets.json"))
res = json.load(open(T0 + "/item1-result.json"))

CLASSES = ["GuidedRunnerClient", "ObservedValidationClient", "GuidedPublicationAuthorization"]
WORD = {c: re.compile(r"(?<![A-Za-z0-9_])" + c + r"(?![A-Za-z0-9_])") for c in CLASSES}


def walk(base):
    for dp, dn, fn in os.walk(base):
        for f in fn:
            if f.endswith((".java", ".md", ".yml", ".xml", ".kts", ".sql", ".json", ".properties")):
                yield os.path.join(dp, f)


def rel(p):
    return os.path.relpath(p, ROOT)


# who names the classes (any of the three), main and test
named = {"main": {}, "test": {}}
for p in walk(BE):
    s = open(p, encoding="utf-8", errors="replace").read()
    hit = [c for c in CLASSES if WORD[c].search(s)]
    if hit:
        side = "test" if "/src/test/" in p else "main"
        named[side][rel(p)] = hit

# declaring files of the three classes (they are deleted, not "edited")
DECL = {
    "GuidedRunnerClient": "backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedRunnerClient.java",
    "ObservedValidationClient": "backend/src/main/java/com/citi/put/checks/studio/guided/publication/ObservedValidationClient.java",
    "GuidedPublicationAuthorization": "backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationAuthorization.java",
}

lane_paths = {}
for lane, recs in writesets.items():
    for r in recs:
        lane_paths.setdefault(r["path"], []).append((lane, r["op"], r.get("part")))

prep = {r["path"] for r in writesets["11-FOLD-prep"]}
final = {r["path"] for r in writesets["11-FOLD-final"]}
fold_tests = set(res["foldTests"]["files"])
fold_main = set(res["foldPrepMain"]["files"])

out = {"naming_main": [], "naming_test": [], "problems": []}

# --- main
main_files = sorted(named["main"])
print("MAIN files naming one of the three classes (excluding the three declaring files):")
for f in main_files:
    if f in DECL.values():
        continue
    owners = lane_paths.get(f, [])
    in_fold = f in prep or f in final
    out["naming_main"].append({"file": f, "names": named["main"][f], "lanes": [o[0] for o in owners], "inFold": in_fold})
    print("   %-118s %-40s %s" % (f.replace("backend/src/main/java/com/citi/put/checks/", ""), ",".join(named["main"][f]),
                                  "fold" if in_fold else ("OTHER-LANE " + str(owners) if owners else "NO LANE")))
    if not in_fold:
        out["problems"].append(("main file names a folded class but is in no FOLD write set", f, owners))
print("   declaring files in FOLD-final delete list:", [DECL[c] in final for c in CLASSES])
# --- tests
print()
print("TEST files naming one of the three classes:")
test_files = sorted(named["test"])
for f in test_files:
    owners = lane_paths.get(f, [])
    in21 = f in fold_tests
    out["naming_test"].append({"file": f, "names": named["test"][f], "inFoldTests21": in21,
                               "lanes": [o[0] for o in owners]})
    flag = "21" if in21 else ("OTHER-LANE " + str(owners) if owners else "NO LANE")
    print("   %-96s %-52s %s" % (f.replace("backend/src/test/java/com/citi/put/checks/studio/", ""), ",".join(named["test"][f]), flag))
    if not in21:
        out["problems"].append(("test file names a folded class but is not in the 21", f, owners))
print("   count naming:", len(test_files), " of which in the 21:", sum(1 for f in test_files if f in fold_tests))
not_naming = sorted(fold_tests - set(test_files))
print("   FOLD_TESTS that do NOT name any of the three classes:", not_naming)
for f in not_naming:
    out["problems"].append(("file in the 21 does not name a folded class (check reason)", f, None))

# every FOLD_TESTS file exists
missing = [f for f in sorted(fold_tests) if not os.path.isfile(ROOT + "/" + f)]
print("   FOLD_TESTS missing on disk:", missing)
out["foldTestsMissing"] = missing
missing_main = [f for f in sorted(fold_main) if not os.path.isfile(ROOT + "/" + f)]
print("   FOLD_PREP_MAIN missing on disk (expected: the 2 new files):", missing_main)

# the 3 files to delete exist
print("   files to delete exist:", {c: os.path.isfile(ROOT + "/" + p) for c, p in DECL.items()})
print("   GuidedPublicationAuthorizationIT exists and is in final as delete:",
      os.path.isfile(BE + "/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationAuthorizationIT.java"),
      any(r["path"].endswith("GuidedPublicationAuthorizationIT.java") and r["op"] == "delete" for r in writesets["11-FOLD-final"]))

# ---- symbols tied to R-4a / R-4b
print()
print("R-4a / R-4b symbol census (files):")
SYMS = {
    "observeRequestBytes": r"observeRequestBytes",
    "definiteContextRefusal": r"definiteContextRefusal",
    "closedContextRefusal": r"closedContextRefusal",
    "CONTEXT_REFUSED": r"CONTEXT_REFUSED",
    "new HttpRunnerDispatchClient(": r"new\s+HttpRunnerDispatchClient\(",
    "new ProvisionalDispatchAuthorization(": r"new\s+ProvisionalDispatchAuthorization\(",
    "StudioRunnerValidated": r"StudioRunnerValidated",
    "authorizePublication": r"authorizePublication",
    "authorizeReceiptRead": r"authorizeReceiptRead",
    "GuidedPublicationAuthorization.fresh / .fresh(": r"\.fresh\(",
}
census = {}
for name, pat in SYMS.items():
    rx = re.compile(pat)
    files = []
    for p in walk(BE):
        if rx.search(open(p, encoding="utf-8", errors="replace").read()):
            files.append(rel(p))
    census[name] = sorted(files)
    covered = []
    uncovered = []
    for f in files:
        lanes = [o[0] for o in lane_paths.get(f, [])]
        cls = f.rsplit("/", 1)[-1]
        decl = cls in ("HttpRunnerDispatchClient.java", "ProvisionalDispatchAuthorization.java", "GuidedRunnerClient.java",
                       "ObservedValidationClient.java", "GuidedPublicationAuthorization.java", "DispatchAuthorization.java")
        if lanes or decl:
            covered.append(f)
        else:
            uncovered.append(f)
    print("  %-44s %2d files; no lane owns: %s" % (name, len(files), [u.rsplit("/", 1)[-1] for u in uncovered]))
    if uncovered:
        out["problems"].append(("symbol %s used in file(s) no lane owns" % name, uncovered, None))
out["census"] = census

json.dump(out, open(T0 + "/item5-fold-check.json", "w"), indent=1, default=list)
print()
print("PROBLEMS:", len(out["problems"]))
for p in out["problems"]:
    print("  -", p)
