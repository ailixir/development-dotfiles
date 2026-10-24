#!/usr/bin/env python3
"""T0-DEV item 1: parse and validate t0/lanes.v3.json, read-only.

Run: python3 -I item1_validate_lanes.py
Reads : t0/lanes.v3.json, t0-prep-20261018/lanes.json (v1, for the 21 FOLD_TESTS)
Writes: item1-writesets.json (normalised write sets, reused by item 4) and item1-result.json
Standard library only.
"""
import json
import os
import re
import sys

ROOT = "/Users/brunobuger/orca/workspaces/put-checks/ui-studio"
EVD = ROOT + "/docs/qa/evidence/STUDIO-OBS-011"
OUT = EVD + "/t0/early/T0-DEV"

v3 = json.load(open(EVD + "/t0/lanes.v3.json"))
v1 = json.load(open(EVD + "/t0-prep-20261018/lanes.json"))
lanes = {x["id"]: x for x in v3["lanes"]}
ids = [x["id"] for x in v3["lanes"]]

result = {"checks": {}, "observations": []}

# ---------------------------------------------------------------- 1a unique ids
dups = sorted({i for i in ids if ids.count(i) > 1})
result["checks"]["unique_lane_ids"] = {"count": len(ids), "distinct": len(set(ids)), "duplicates": dups, "pass": not dups}

# ---------------------------------------------------------------- write-set normalisation
V1_FOLD = {x["id"]: x for x in v1["lanes"]}["11-FOLD-final"]
FOLD_TESTS = [re.split(r"\s", w)[0] for w in V1_FOLD["writes"] if w.startswith("backend/src/test")]
FOLD_PREP_MAIN = [
    re.split(r"\s", w)[0] for w in lanes["11-FOLD-prep"]["writes"] if w.startswith("backend/src/main")
]

PATH_RE = re.compile(r"^(backend|studio-runner|frontend|docs|helm-chart|tools|\.github)/")
ROOTFILES = ("CLAUDE.md", "ARCH.md", "AGENTS.md")


def expand_braces(p):
    m = re.search(r"\{([^{}]*)\}", p)
    if not m:
        return [p]
    out = []
    for alt in m.group(1).split(","):
        out.extend(expand_braces(p[: m.start()] + alt + p[m.end():]))
    return out


def op_of(raw):
    if re.search(r"\(delete\b|empty directory: delete|\(delete after", raw):
        return "delete"
    if re.search(r"\(new\b", raw):
        return "new"
    return "edit"


def norm(lane_id, raw):
    """Return list of dicts for one raw write string."""
    s = re.sub(r"^(prep|apply):\s*", "", raw)
    part = None
    if raw.startswith("prep:"):
        part = "prep"
    elif raw.startswith("apply:"):
        part = "apply"
    recs = []

    def add(path, op=None, kind=None, note=None, part_=None):
        recs.append({
            "lane": lane_id, "path": path, "op": op or op_of(raw),
            "kind": kind or ("glob" if path.endswith("/**") else ("dir" if path.endswith("/") else "file")),
            "part": part_ or part, "note": note, "raw": raw,
        })

    if s.startswith("every FOLD_PREP_MAIN file"):
        for p in FOLD_PREP_MAIN:
            add(p, "edit", note="FOLD_PREP_MAIN expansion")
        return recs
    if s.startswith("the 21 FOLD_TESTS"):
        for p in FOLD_TESTS:
            add(p, "delete" if p.endswith("GuidedPublicationAuthorizationIT.java") else "edit",
                note="FOLD_TESTS expansion (v1 11-FOLD-final)")
        return recs
    if s.startswith("copy-back of the 11-RT and 11-FE"):
        for lid in ("11-RT", "11-FE"):
            for r in lanes[lid]["writes"]:
                tok = re.split(r"\s", r)[0]
                if tok.startswith("docs/qa/evidence/STUDIO-OBS-011/execution/"):
                    continue
                if "<" in r.split(" (")[0]:
                    tok = "frontend/src/components/studio/guided/<NEW-copy-source-registry>"
                for p in expand_braces(tok):
                    add(p, "edit", note="copy-back of %s sandbox set" % lid)
        return recs
    if s.startswith("local docker image"):
        return recs  # not a file path
    if "<test-only copy-source registry>" in s:
        add("frontend/src/components/studio/guided/<NEW-copy-source-registry>", "new",
            note="name chosen by @dev; placeholder")
        return recs
    tok = s.split(" ")[0]
    if not (PATH_RE.match(tok) or tok in ROOTFILES):
        result["observations"].append("unparsed write entry in %s: %r" % (lane_id, raw))
        return recs
    for p in expand_braces(tok):
        add(p)
    return recs


# GuidedSessionIT / AdmissionWithoutTranslationIT are part b of 11-GS-M; the two new a-IT files are part a.
GSM_PART_B_ONLY = ("GuidedSessionIT.java", "GuidedAdmissionWithoutTranslationIT.java")
GSM_PART_A_ONLY = ("GuidedTeardownShedTest.java", "GuidedResultPublicationDisabledIT.java")

writesets = {}
nonempty = {}
for lid in ids:
    recs = []
    for raw in lanes[lid]["writes"]:
        recs.extend(norm(lid, raw))
    if lid == "11-GS-M":
        for r in recs:
            if r["path"].endswith(GSM_PART_B_ONLY):
                r["part"] = "b"
            elif r["path"].endswith(GSM_PART_A_ONLY):
                r["part"] = "a"
            else:
                r["part"] = "a+b"
    writesets[lid] = recs
    nonempty[lid] = {"raw_entries": len(lanes[lid]["writes"]), "normalised_paths": len(recs), "pass": len(recs) > 0}

# IT-R: K-17 says prep writes t0/early/it-r/ during B1 -- not in the lane's own write list
result["observations"].append(
    "11-IT-R prep: K-17 (record 5.2) and the lane startsWhen say prep writes docs/qa/evidence/STUDIO-OBS-011/t0/early/it-r/ "
    "until 'tree open'; that path is not in the 11-IT-R write list (only execution/it-r/prep/**). It falls under the 11-T0 "
    "write set (t0/**), so there is no conflict, but the two are not stated together."
)

result["checks"]["write_sets_nonempty"] = {
    "per_lane": nonempty, "pass": all(v["pass"] for v in nonempty.values()),
}
result["foldTests"] = {"count": len(FOLD_TESTS), "files": FOLD_TESTS}
result["foldPrepMain"] = {"count": len(FOLD_PREP_MAIN), "files": FOLD_PREP_MAIN}

json.dump(writesets, open(OUT + "/item1-writesets.json", "w"), indent=1)

# ---------------------------------------------------------------- dependencies
ID_SET = set(ids)
ID_RE = re.compile(r"11-(?:T0|GS-T2|GS-T|GS-M|LEFT|FOLD-prep|FOLD-final|RT|IT-R|IT-S|FE|DOC|MERGE|G)(?![A-Za-z0-9])")


def refs(text):
    return sorted(set(ID_RE.findall(text)))


# schedule intervals (working days) keyed by lane/part
SCHED = {k: tuple(v) for k, v in v3["schedule"]["lanes"].items()}
SCHED_KEY = {
    "11-T0": ["11-T0"], "11-GS-T": ["11-GS-T"], "11-GS-M": ["11-GS-M (a)", "11-GS-M (b)"],
    "11-LEFT": ["11-LEFT"], "11-FOLD-prep": ["11-FOLD-prep"], "11-RT": ["11-RT"],
    "11-IT-R": ["11-IT-R (prep)", "11-IT-R (apply, timeboxed)"], "11-IT-S": ["11-IT-S"],
    "11-GS-T2": ["11-GS-T2"], "11-FE": ["11-FE"], "11-DOC": ["11-DOC"], "11-FOLD-final": ["11-FOLD-final"],
    "11-MERGE": ["11-MERGE frontend half", "11-MERGE runner half"], "11-G": ["11-G"],
}


def span(lid):
    ks = SCHED_KEY[lid]
    return (min(SCHED[k][0] for k in ks), max(SCHED[k][1] for k in ks))


dep = {}
dep_problems = []
for lid in ids:
    x = lanes[lid]
    start_refs = set()
    prose_refs = set()
    for s in x.get("startsWhen", []):
        # prose cross-references ("a free agent slot ... 11-IT-R prep runs first", "replaces '11-RT exit frees a slot'")
        # are scheduling notes, not completion dependencies
        if "slot" in s or "replaces" in s:
            prose_refs.update(refs(s))
        else:
            start_refs.update(refs(s))
    baton_refs = set()
    bo = x.get("batonOut", {})
    for k, v in bo.items():
        baton_refs.update(refs(k + " " + v))
    allrefs = start_refs | baton_refs
    unresolved = sorted(r for r in allrefs if r not in ID_SET)
    start_refs.discard(lid)
    dep[lid] = {"proseRefsIgnored": sorted(prose_refs), "startsWhen_refs": sorted(start_refs), "batonOut_refs": sorted(baton_refs - {lid}), "unresolved": unresolved}
    if unresolved:
        dep_problems.append((lid, unresolved))
    # order check by schedule: each start-ref must end no later than this lane's span start
    for r in start_refs:
        if r in ID_SET and r != lid:
            if span(r)[1] > span(lid)[1] + 1e-9:
                dep_problems.append((lid, "dependency %s ends after %s ends" % (r, lid)))
            # for the 'exit' kind of reference the prerequisite must end at/before this lane's own start;
            # exceptions: parts (GS-M b starts after GS-T), MERGE frontend half may overlap FOLD-final
# part-aware precise edges (taken from the startsWhen text)
EDGES = [
    ("11-GS-T", "11-GS-M(b)", 3.5, 3.5),
    ("11-GS-M(b)", "11-IT-R(apply)", 4.5, 4.5),
    ("11-GS-M(b)", "11-IT-S", 4.5, 4.5),
    ("11-GS-M(b)", "11-GS-T2", 4.5, 4.5),
    ("11-FOLD-prep", "11-FOLD-final", 5.0, 6.5),
    ("11-IT-R(apply)", "11-FOLD-final", 6.5, 6.5),
    ("11-IT-S", "11-FOLD-final", 6.5, 6.5),
    ("11-GS-T2", "11-FOLD-final", 6.0, 6.5),
    ("11-GS-M(b)", "11-FOLD-final", 4.5, 6.5),
    ("11-FE", "11-MERGE(frontend)", 4.5, 4.5),
    ("11-DOC", "11-MERGE(frontend)", 4.0, 4.5),
    ("11-FOLD-final", "11-MERGE(runner)", 9.0, 9.0),
    ("11-RT", "11-MERGE(runner)", 1.5, 9.0),
    ("11-MERGE(runner)", "11-G", 9.5, 9.5),
]
edge_bad = [e for e in EDGES if e[2] > e[3] + 1e-9]
# cycle check on lane-level graph
graph = {lid: set(dep[lid]["startsWhen_refs"]) for lid in ids}
state = {}
cycle = []


def dfs(n, stack):
    state[n] = 1
    for m in graph.get(n, ()):
        if m not in graph:
            continue
        if state.get(m) == 1:
            cycle.append(stack + [n, m])
        elif state.get(m) is None:
            dfs(m, stack + [n])
    state[n] = 2


for n in ids:
    if state.get(n) is None:
        dfs(n, [])

# external (non-lane) prerequisites that can be verified from the tree
ext = {}
ext["execute-011 collectors exist"] = all(
    os.path.isfile(ROOT + "/.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/" + f)
    for f in ("run-backend-tasked.py", "run-backend.py", "run-runner.py", "run-runner-build.py", "run-frontend.py")
)
ext["010 dated Live surface list exists"] = os.path.isfile(
    ROOT + "/docs/qa/evidence/STUDIO-OBS-010/live-surface-20261018/live-surface-list.json")
ext["runbook s14 UAT note present (Gage X-6)"] = "UAT breaks on upgrade unless" in open(
    ROOT + "/docs/runbooks/studio-runner.md", encoding="utf-8").read()
ext["print-observed-catalog.mjs present (X-7)"] = os.path.isfile(ROOT + "/studio-runner/scripts/print-observed-catalog.mjs")
ext["execute-011 output folder exists"] = os.path.isdir(EVD + "/execution")

# every lane id referenced anywhere in waves / concurrencyGroups / sharedFilesSingleOwner / schedule resolves
loose = set()
for blob in (json.dumps(v3["waves"]), json.dumps(v3["concurrencyGroups"]), json.dumps(v3["sharedFilesSingleOwner"]),
             json.dumps(v3["criticalPath"])):
    loose.update(refs(blob))
loose_bad = sorted(r for r in loose if r not in ID_SET)
# "11-GS-M (a)" style labels in groups/waves/schedule: base id must exist
label_bad = []
for g, items in v3["concurrencyGroups"].items():
    for it in items:
        for r in refs(it):
            if r not in ID_SET:
                label_bad.append((g, it))
sched_bad = [k for k in SCHED if not any(k in v for v in SCHED_KEY.values())]

result["checks"]["dependencies_resolve"] = {
    "per_lane": dep,
    "unresolved_or_misordered": dep_problems,
    "partAwareEdges": [{"from": a, "to": b, "prereqEnds": c, "dependentStarts_or_ends": d} for a, b, c, d in EDGES],
    "edgesWherePrereqEndsAfterDependentStarts": edge_bad,
    "cycles": cycle,
    "externalPrerequisites": ext,
    "looseRefsInWavesGroupsShared": {"unresolved": loose_bad, "labelBad": label_bad},
    "scheduleKeysWithoutLane": sched_bad,
    "pass": not dep_problems and not edge_bad and not cycle and all(ext.values()) and not loose_bad and not label_bad and not sched_bad,
}

# ---------------------------------------------------------------- pairwise overlap


def covers(a, b):
    """Path a (maybe glob/dir) covers or equals path b (maybe glob/dir), or vice versa."""
    def base(p):
        if p.endswith("/**"):
            return p[:-3].rstrip("/") + "/", True
        if p.endswith("/"):
            return p, True
        return p, False
    pa, da = base(a)
    pb, db = base(b)
    if pa == pb:
        return True
    if da and pb.startswith(pa):
        return True
    if db and pa.startswith(pb):
        return True
    return False


def parts_compatible_concurrent(p1, p2):
    """parts that can never run at once are treated as sequential."""
    if p1 == p2:
        return True
    if {p1, p2} == {"a", "b"}:
        return False
    if {p1, p2} == {"prep", "apply"}:
        return False
    return True


GROUPS = {
    "W1": [("11-GS-T", None), ("11-GS-M", "a"), ("11-LEFT", None), ("11-FOLD-prep", None), ("11-IT-R", "prep"),
           ("11-RT", None), ("11-FE", None), ("11-DOC", None)],
    "W2": [("11-GS-M", "b"), ("11-FOLD-prep", None), ("11-FE", None), ("11-DOC", None), ("11-IT-R", "prep")],
    "W3": [("11-IT-R", "apply"), ("11-IT-S", None), ("11-GS-T2", None), ("11-FOLD-prep", None)],
    "W3+waves-array": [("11-IT-R", "apply"), ("11-IT-S", None), ("11-GS-T2", None), ("11-FOLD-prep", None),
                       ("11-MERGE", "frontend")],
    "W4": [("11-FOLD-final", None), ("11-MERGE", "frontend")],
    "W5": [("11-MERGE", "runner")],
    "W6": [("11-G", None)],
}


def rec_active(rec, part):
    if part is None:
        return True
    rp = rec["part"]
    if rp is None or rp == "a+b":
        return True
    return rp == part


def in_group(lid, part, rec):
    if lid == "11-MERGE":
        return True  # MERGE has no part marker in write list: treated as active in both halves (conservative)
    return rec_active(rec, part)


pair_hits = {}
for gname, members in GROUPS.items():
    hits = []
    for i in range(len(members)):
        for j in range(i + 1, len(members)):
            (l1, p1), (l2, p2) = members[i], members[j]
            if l1 == l2:
                continue
            for r1 in writesets[l1]:
                if not in_group(l1, p1, r1):
                    continue
                for r2 in writesets[l2]:
                    if not in_group(l2, p2, r2):
                        continue
                    if covers(r1["path"], r2["path"]):
                        hits.append({"a": "%s%s" % (l1, "(" + p1 + ")" if p1 else ""), "b": "%s%s" % (l2, "(" + p2 + ")" if p2 else ""),
                                     "pathA": r1["path"], "pathB": r2["path"]})
    pair_hits[gname] = hits

# strict all-pairs, with ordering/baton explanation
SPAN = {}
for lid in ids:
    SPAN[lid] = span(lid)


def part_span(lid, part):
    if lid == "11-GS-M":
        return SCHED["11-GS-M (%s)" % ("a" if part == "a" else "b")] if part in ("a", "b") else SPAN[lid]
    if lid == "11-IT-R":
        return SCHED["11-IT-R (prep)"] if part == "prep" else SCHED["11-IT-R (apply, timeboxed)"] if part == "apply" else SPAN[lid]
    return SPAN[lid]


shared = {}
for i, l1 in enumerate(ids):
    for l2 in ids[i + 1:]:
        for r1 in writesets[l1]:
            for r2 in writesets[l2]:
                if covers(r1["path"], r2["path"]):
                    key = r1["path"] if not r1["path"].endswith("/**") else r2["path"]
                    shared.setdefault(key, set()).add((l1, r1["part"], r1["op"], l2, r2["part"], r2["op"]))

all_pairs = []
for path, items in sorted(shared.items()):
    for (l1, p1, o1, l2, p2, o2) in sorted(items, key=lambda t: str(t)):
        s1 = part_span(l1, p1 if p1 in ("a", "b", "prep", "apply") else None)
        s2 = part_span(l2, p2 if p2 in ("a", "b", "prep", "apply") else None)
        concurrent = not (s1[1] <= s2[0] + 1e-9 or s2[1] <= s1[0] + 1e-9)
        first, second = (l1, l2) if s1[0] <= s2[0] else (l2, l1)
        # declared baton: first lane's batonOut mentions the second lane (or the file) / second lane's startsWhen mentions first
        b_first = json.dumps(lanes[first].get("batonOut", {}))
        s_second = json.dumps(lanes[second].get("startsWhen", []))
        declared = (second in refs(b_first)) or (first in refs(s_second))
        if first == second:
            declared = True
        all_pairs.append({"path": path, "laneA": l1, "partA": p1, "opA": o1, "laneB": l2, "partB": p2, "opB": o2,
                          "spansA": s1, "spansB": s2, "overlapInTime": concurrent, "orderDeclared": declared,
                          "firstLane": first, "secondLane": second})

# evidence prefix noise: each lane's own execution/<lane>/** never overlaps another lane's (checked: ok if none listed)
real_conflicts = [p for p in all_pairs if p["overlapInTime"] and not p["orderDeclared"]]
undeclared = [p for p in all_pairs if not p["orderDeclared"]]

# ---- the sharedFilesSingleOwner file table versus mechanical result
sfo = v3["sharedFilesSingleOwner"]
sfo_files = [k for k in sfo if k.startswith("backend/")]
mech_files = sorted({p["path"] for p in all_pairs if p["path"].startswith("backend/")})
missing_from_sfo = sorted(set(mech_files) - set(sfo_files))
extra_in_sfo = sorted(set(sfo_files) - set(mech_files) - {
    "backend/src/test/java/com/citi/put/checks/studio/support/Await.java"})

result["checks"]["no_wave_overlap"] = {
    "method": "mechanical pairwise over normalised write sets; globs and dirs by prefix; "
              "11-GS-M split a / b and 11-IT-R split prep / apply; groups from lanes.v3.json concurrencyGroups "
              "(+ the 'waves' array variant that puts MERGE frontend half in W3)",
    "perGroupHits": pair_hits,
    "perGroupHitCount": {k: len(v) for k, v in pair_hits.items()},
    "strictAllPairs": {
        "pairCount": len(all_pairs),
        "pairs": all_pairs,
        "concurrentWithoutDeclaredOrder": real_conflicts,
        "withoutDeclaredOrderAtAll": undeclared,
    },
    "sharedFilesSingleOwnerTable": {
        "mechanicalSharedBackendFiles": mech_files,
        "missingFromTable": missing_from_sfo,
        "inTableButNotShared": extra_in_sfo,
    },
    "pass": all(len(v) == 0 for v in pair_hits.values()) and not real_conflicts,
}

# GS-M(a) vs GS-T in W1 -- the record's explained single hit
explain = [h for g in ("W1",) for h in pair_hits[g]]

# ---------------------------------------------------------------- other loose-end consistency checks
lanes_in_waves = set()
for w in v3["waves"]:
    for it in w["lanes"]:
        lanes_in_waves.update(refs(it))
missing_in_waves = sorted(ID_SET - lanes_in_waves)
result["checks"]["every_lane_scheduled_in_waves"] = {"missing": missing_in_waves, "pass": not missing_in_waves}

# agent count with K-17: IT-R prep from B1, RT takes the first freed slot
result["observations"].append(
    "schedule.lanes still puts 11-RT at [0.5,1.5] and 11-IT-R prep at [1.5,3.0] (the v2 order). Record 5.2 K-17 and 14.2 "
    "put 11-IT-R prep first (from B1) and 11-RT 'as slots free'. Both orders keep write sets disjoint, but with IT-R prep "
    "running from 0.5 the agent count at 0.5-1.5 would be 6 (GS-T, GS-M a, LEFT, FOLD-prep, IT-R prep, RT) against "
    "maxParallelism 5. The schedule block was not re-cut for K-17. Doc fix only; no write-set effect."
)
result["observations"].append(
    "waves[W3] lists '11-MERGE frontend half (root)' but concurrencyGroups puts it in W4 (and schedule.lanes has it at 4.5-5.0, "
    "i.e. W3 timing). Checked both variants above (group 'W3+waves-array'): no write-set hit either way."
)
result["observations"].append(
    "11-FOLD-final writes reference 'FOLD_PREP_MAIN' and 'the 21 FOLD_TESTS listed in lanes.json v1': neither is defined inside "
    "lanes.v3.json. FOLD_PREP_MAIN is derivable (the 11-FOLD-prep writes under backend/src/main = %d paths); the 21 are in v1. "
    "A reader of v3 alone cannot resolve them." % len(FOLD_PREP_MAIN)
)
result["observations"].append(
    "11-IT-S batonOut says 'all six files -> 11-FOLD-final', but only 4 of the 6 are FOLD_TESTS "
    "(SecretUseAuditIT and GuidedPublicationRaceTest are not). Wording only; the baton for those two is simply released."
)

result["checks"]["fold_lane_lists_match"] = {
    "foldTests": len(FOLD_TESTS),
    "foldTestsDistinct": len(set(FOLD_TESTS)),
    "foldPrepMain": len(FOLD_PREP_MAIN),
}

json.dump(result, open(OUT + "/item1-result.json", "w"), indent=1, default=list)

# ---------------------------------------------------------------- console summary
print("unique ids:", result["checks"]["unique_lane_ids"])
print("non-empty:", {k: v["normalised_paths"] for k, v in nonempty.items()})
print("deps pass:", result["checks"]["dependencies_resolve"]["pass"],
      "problems:", dep_problems, "edgeBad:", edge_bad, "cycles:", cycle)
print("external prerequisites:", ext)
print("loose bad:", loose_bad, label_bad, sched_bad)
print("per-group hits:", result["checks"]["no_wave_overlap"]["perGroupHitCount"])
for g, hs in pair_hits.items():
    for h in hs:
        print("  ", g, h)
print("strict pairs:", len(all_pairs), "concurrent w/o declared order:", len(real_conflicts), "no declared order at all:", len(undeclared))
for p in all_pairs:
    print("   %-32s %-14s %-4s | %-14s %-4s | concurrent=%s declared=%s" % (
        os.path.basename(p["path"].rstrip("/*")) or p["path"], p["laneA"], p["partA"], p["laneB"], p["partB"],
        p["overlapInTime"], p["orderDeclared"]))
print("sharedFilesSingleOwner: missing from table:", missing_from_sfo)
print("sharedFilesSingleOwner: in table but not shared:", extra_in_sfo)
print("lanes missing from waves:", missing_in_waves)
print("FOLD_TESTS:", len(FOLD_TESTS), "FOLD_PREP_MAIN:", len(FOLD_PREP_MAIN))
for o in result["observations"]:
    print("OBS:", o)
