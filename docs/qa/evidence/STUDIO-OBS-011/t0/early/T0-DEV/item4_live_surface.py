#!/usr/bin/env python3
"""T0-DEV item 4: cross every 11-* write set (from item1-writesets.json) with the 671 protected Live-surface entries.

Run (after item1): python3 -I item4_live_surface.py
Reads : item1-writesets.json, STUDIO-OBS-010/live-surface-20261018/live-surface-list.json
Writes: item4-file-hits.json (raw co-location), prints a summary.

Two passes:
  pass A (file level): a protected entry is co-located when any path token in anchor / skeletonAnchor / preG9Anchor / surface
         equals, or lies under, a lane write path (globs and dirs by prefix).
  pass B (symbol level): the symbols that a lane REMOVES or RENAMES (class names, methods, config keys, record components)
         are searched in every field of every protected entry, whatever file the anchor names.
The judgement of each hit (surface touched or not) is in item4_judgement.py / check.md, not here.
"""
import json
import re
import sys

ROOT = "/Users/brunobuger/orca/workspaces/put-checks/ui-studio"
T0 = ROOT + "/docs/qa/evidence/STUDIO-OBS-011/t0/early/T0-DEV"
LS = ROOT + "/docs/qa/evidence/STUDIO-OBS-010/live-surface-20261018/live-surface-list.json"

writesets = json.load(open(T0 + "/item1-writesets.json"))
live = json.load(open(LS))
entries = live["entries"]
protected = [e for e in entries if e["protection"] == "protected"]
assert len(protected) == 671, len(protected)

PATH_TOKEN = re.compile(
    r"(?:backend|studio-runner|frontend|docs|helm-chart|tools|\.github|contracts)/[A-Za-z0-9_./\-{}@]+|Dockerfile")


def paths_of(entry):
    toks = set()
    for fld in ("anchor", "skeletonAnchor", "preG9Anchor"):
        v = entry.get(fld)
        if v is None:
            continue
        for a in (v if isinstance(v, list) else [v]):
            for m in PATH_TOKEN.finditer(str(a)):
                t = m.group(0).rstrip(".,:;)")
                t = re.sub(r":\d+.*$", "", t)
                toks.add(t)
    for m in PATH_TOKEN.finditer(str(entry.get("surface", ""))):
        toks.add(re.sub(r":\d+.*$", "", m.group(0).rstrip(".,:;)")))
    return toks


def covers(wp, ep):
    """write path wp covers entry path ep (or the reverse for dirs)."""
    def base(p):
        if p.endswith("/**"):
            return p[:-3].rstrip("/") + "/", True
        if p.endswith("/"):
            return p, True
        return p, False
    a, da = base(wp)
    b, db = base(ep)
    if a == b:
        return True
    if da and b.startswith(a):
        return True
    if db and a.startswith(b):
        return True
    return False


# ---- pass A
hitsA = {}
for lane, recs in writesets.items():
    for r in recs:
        wp = r["path"]
        if wp.startswith("docs/qa/evidence/STUDIO-OBS-011/"):
            continue  # lane receipt folders: no surface lives there
        for e in protected:
            for ep in paths_of(e):
                if covers(wp, ep):
                    hitsA.setdefault((lane, wp, r["op"]), {}).setdefault(e["id"], set()).add(ep)

out = []
for (lane, wp, op), ents in sorted(hitsA.items()):
    out.append({"lane": lane, "writePath": wp, "op": op, "entryCount": len(ents),
                "entries": {k: sorted(v) for k, v in sorted(ents.items())}})
json.dump(out, open(T0 + "/item4-file-hits.json", "w"), indent=1)

print("PASS A: write paths with protected-entry co-location:", len(out))
for o in out:
    print("  %-14s %-8s %-110s -> %d entries: %s" % (o["lane"], o["op"], o["writePath"][-110:], o["entryCount"],
                                                       ",".join(list(o["entries"])[:12])))

# ---- pass B: symbols removed / renamed / changed by lanes, searched in every field of every protected entry
SYMBOLS = {
    # 11-FOLD-final deletions and the types folded into dispatch
    "GuidedRunnerClient": "11-FOLD-final delete",
    "ObservedValidationClient": "11-FOLD-final delete",
    "GuidedPublicationAuthorization": "11-FOLD-final delete (class) / GuidedPublicationAuthorizationIT delete",
    "StudioRunnerValidated": "nested type removed with GuidedPublicationAuthorization",
    "unavailableGuidedRunnerClient": "R-4a: 409 behaviour preserved",
    "HttpRunnerDispatchClient": "11-FOLD-prep/final edit",
    "ProvisionalDispatchAuthorization": "11-FOLD-prep edit",
    "DispatchAuthorization": "11-FOLD-prep edit",
    "PublicationGrantAuthority": "11-FOLD-prep new",
    "StudioRunnerTls": "11-FOLD-prep edit",
    "StudioRunnerConfiguration": "11-FOLD-prep edit",
    "GuidedSessionConfiguration": "11-FOLD-prep edit",
    "GuidedPreparationStore": "11-FOLD-prep edit",
    "GuidedDispatchService": "11-FOLD-prep edit",
    "GuidedTranslationService": "11-FOLD-prep type swap",
    "GuidedPlanPublisher": "11-FOLD-prep edit",
    "GuidedPublicationConfiguration": "11-FOLD-prep edit",
    "ObservedReplayAuthorizer": "11-FOLD-prep edit",
    "ObservedReplayAuthorization": "11-FOLD-prep edit",
    "ObservedReplayConfiguration": "11-FOLD-prep edit",
    "ObservedReplayBindingBuilder": "11-FOLD-prep new",
    "GuidedPublicationResultProjector": "11-GS-M / 11-FOLD-final edit",
    # 11-LEFT removals
    "ExecutionStatus": "11-LEFT: isCanonical + CANONICAL removed",
    "isCanonical": "11-LEFT remove",
    "CANONICAL": "11-LEFT remove",
    "allocationIds": "11-LEFT remove",
    "isApiAssigned": "11-LEFT remove",
    "providerName": "11-LEFT remove",
    "getSecretName": "11-LEFT remove",
    "updateAuthoring": "11-LEFT remove",
    "pollIntervalOrDefault": "11-LEFT remove",
    "readIntervalOrDefault": "11-LEFT remove",
    "pollInterval": "11-LEFT: record component removed",
    "readInterval": "11-LEFT: record component removed",
    "read-interval": "11-LEFT: yml leaf removed (prefix of read-interval-ms)",
    "READ_INTERVAL": "11-LEFT: env of the removed leaf",
    "POLL_INTERVAL": "11-LEFT: env of the removed component",
    "poll-interval": "11-LEFT: component binding name",
    "studio.compile": "11-LEFT: JaCoCo rules",
    "recordEvidence": "11-GS-M remove",
    "HistoricalV18": "11-LEFT CLN-F2 retire",
    "requireV18": "11-LEFT CLN-F2 retire",
    "V18": "11-LEFT CLN-F2 (migration tests/fixture only)",
    "GuidedSourceInputResolver": "11-LEFT edit",
    "RunnerOutcomeCodes": "11-LEFT edit",
    "VaultStudioReferenceResolver": "11-LEFT edit",
    "SecretAlreadyExistsException": "11-LEFT edit",
    "StudioSecretsService": "11-LEFT javadoc",
    "StudioService": "11-LEFT updateAuthoring",
    "OBSERVED_SCHEDULE_AUTH_REQUIRED": "11-LEFT AC-3 record only",
    # 11-GS-M part b (F-1) and part a
    "requireTranslation": "11-GS-M new helper",
    "GuidedSessionService": "11-GS-M edit",
    "GuidedSessionController": "11-GS-M edit",
    "TEARDOWNS_IN_FLIGHT": "11-GS-M part a",
    "DiscardPolicy": "11-GS-M part a",
    # 11-RT / 11-FE / 11-DOC
    "browser-oracle": "11-RT delete",
    "example-manifest": "11-RT delete",
    "PinnedStoppedRunRecordingFacts": "11-FE remove",
    "VITE_ALLOW_INSECURE_MSW_FALLBACK": "11-FE remove bullet",
    "studioAuthoringV2": "11-DOC text",
    "STUDIO_AUTHORING_V2_ENABLED": "11-DOC text",
    "STUDIO_INCREMENTAL_ENABLED": "11-DOC text",
    "complete API lifecycle": "11-DOC text",
    "RunDetailsDrawer": "11-FE R-CO (conditional)",
    "Confirmed revision": "11-FE R-CO (conditional)",
    "deferred.test": "11-RT R-40",
    "guidedBrowser": "11-RT reformat + comment",
    "axe-results": "11-FE/11-MERGE regenerated",
    "ReplayAccountAccess": "already deleted (R4 C-2)",
    "AccountAccess": "11-FOLD-prep README text",
}


def blob(e):
    return json.dumps(e, ensure_ascii=False)


hitsB = {}
for sym, why in SYMBOLS.items():
    for e in protected:
        b = blob(e)
        if re.search(r"(?<![A-Za-z0-9_])" + re.escape(sym) + r"(?![A-Za-z0-9_])", b) or (
                sym.startswith("studio.") and sym in b) or ("-" in sym and sym in b) or ("_" in sym and sym in b):
            hitsB.setdefault(sym, []).append(e["id"])

print()
print("PASS B: symbol -> protected entries mentioning it (any field)")
for sym, ids in hitsB.items():
    print("  %-34s [%s] %d: %s" % (sym, SYMBOLS[sym][:40], len(ids), ",".join(ids[:14]) + (" ..." if len(ids) > 14 else "")))
json.dump({s: ids for s, ids in hitsB.items()}, open(T0 + "/item4-symbol-hits.json", "w"), indent=1)
print()
print("symbols with 0 protected hits:", sorted(set(SYMBOLS) - set(hitsB)))
