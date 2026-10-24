#!/usr/bin/env python3
"""UNEXECUTED: run/restore exactly one mutant inside the caller-held execute-008 lock."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("mutant", choices=("warn-every-call", "warn-never", "refused-to-pending",
                                      "actual-base-removed"))
parser.add_argument("label")
parser.add_argument("--root-proof-barrier-released", action="store_true", required=True)
args = parser.parse_args()
sys.dont_write_bytecode = True
root = Path.cwd().resolve()
draft = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("gsm_staging_common", draft / "staging_common.py")
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)
manifest, results, receipts = common.preflight(draft, root, args.label)
sha = common.sha
for fact in manifest["files"]:
    path = common.plain_path(root / fact["path"], root)
    if not path.is_file() or sha(path.read_bytes()) != fact["draftSha256"]:
        raise SystemExit("Rebase/review changed final draft source: " + fact["path"])
service = root / "backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java"
original = service.read_bytes()
old, new = {
    "warn-every-call": (
        "if (!now.isBefore(due) && nextShedReport.compareAndSet(due, now.plus(TEARDOWN_SHED_WARN_INTERVAL))) {",
        "if (true) {"),
    "warn-never": (
        'LOG.warn("Guided teardown executor shed: {} attempt(s)", shedTeardowns.getAndSet(0));',
        "// Mutant: no shed WARN."),
    "refused-to-pending": ('? "REFUSED"', '? "PENDING"'),
    "actual-base-removed": (
        '&& state.equals("SUCCEEDED")\n                            && !publicationPolicy.baseExists().test(id))',
        '&& state.equals("SUCCEEDED"))'),
}[args.mutant]
source = original.decode()
if source.count(old) != 1:
    raise SystemExit("Mutation anchor is not unique")
mutated = source.replace(old, new).encode()
if sha(mutated) != manifest["mutations"][args.mutant]["mutatedServiceSha256"]:
    raise SystemExit("Mutation differs from reviewed patch/manifest")
name = ("GuidedResultPublicationDisabledIT" if args.mutant in
        ("refused-to-pending", "actual-base-removed") else "GuidedTeardownShedTest")
classes = ["com.citi.put.checks.studio.guided.session." + name]
run = common.command(args.label, classes)
result = results / (args.label + "-results.json")
receipt = receipts / (args.label + "-mutation.json")
receipts.mkdir(parents=True, exist_ok=True)
collector_exit = None
missing = sorted(common.required_cases(manifest, classes))
try:
    service.write_bytes(mutated)
    with (receipts / (args.label + "-listeners.txt")).open("x") as listeners:
        subprocess.run(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN"], stdout=listeners, check=False)
    collector_exit = subprocess.run(run, cwd=root, check=False).returncode
    missing = common.fresh_cases(result, common.required_cases(manifest, classes))
finally:
    service.write_bytes(original)
    restored = sha(service.read_bytes())
    receipt.write_text(json.dumps({"mutant": args.mutant, "label": args.label,
        "beforeSha256": sha(original), "mutatedSha256": sha(mutated),
        "restoredSha256": restored, "restoreMatches": restored == sha(original),
        "collectorExit": collector_exit, "missingExpectedTestcases": missing,
        "redVerdict": "UNASSESSED_READ_NEW_TEST_ASSERTIONS", "command": run}, indent=2) + "\n")
    if restored != sha(original):
        raise RuntimeError("Restored source hash differs")
raise SystemExit(collector_exit if collector_exit is not None else 1)
