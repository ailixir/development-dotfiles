#!/usr/bin/env python3
"""UNEXECUTED: caller-held execute-008 lock and explicit root proof release are mandatory."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("stage", choices=("red", "result-red", "green"))
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
service_path = "backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java"
neutral = (draft / "red-seam-reference.java.txt").read_bytes()
changes = {}
for fact in manifest["files"]:
    path = common.plain_path(root / fact["path"], root)
    expected = fact["baseSha256"] if args.stage == "red" else (
        sha(neutral) if fact["path"] == service_path else
        fact["baseSha256"] if "/src/main/" in fact["path"] else fact["draftSha256"])
    current = path.read_bytes() if path.exists() else None
    if (sha(current) if current is not None else None) != expected:
        raise SystemExit("Stage prerequisite hash differs: " + fact["path"])
    if args.stage == "red":
        if fact["path"] == service_path:
            changes[path] = neutral
        elif "/src/test/" in fact["path"]:
            changes[path] = (draft / "repo" / fact["path"]).read_bytes()
    elif args.stage == "green" and "/src/main/" in fact["path"]:
        changes[path] = (draft / "repo" / fact["path"]).read_bytes()
base = "com.citi.put.checks.studio.guided."
classes = [base + "session.GuidedTeardownShedTest"]
if args.stage == "result-red":
    classes = [base + "session.GuidedResultPublicationDisabledIT"]
elif args.stage == "green":
    classes += [base + "session.GuidedResultPublicationDisabledIT",
                base + "retention.GuidedObservationPrunerIT"]
expected_cases = common.required_cases(manifest, classes)
run = common.command(args.label, classes)
result = results / (args.label + "-results.json")
receipt = receipts / (args.label + "-stage.json")
receipts.mkdir(parents=True, exist_ok=True)
backups = {path: path.read_bytes() if path.exists() else None for path in changes}
missing = sorted(expected_cases)
collector_exit = None
try:
    for path, data in changes.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    with (receipts / (args.label + "-listeners.txt")).open("x") as listeners:
        subprocess.run(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN"], stdout=listeners, check=False)
    collector_exit = subprocess.run(run, cwd=root, check=False).returncode
    missing = common.fresh_cases(result, expected_cases)
finally:
    # Restore the whole staged unit if fresh full selected discovery is absent. Assertion outcomes
    # remain QA-owned; discovery alone is neither assertion-red nor green credit.
    if missing:
        for path, data in backups.items():
            if data is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(data)
    receipt.write_text(json.dumps({"stage": args.stage, "label": args.label,
        "collectorExit": collector_exit, "missingExpectedTestcases": missing,
        "completeSelectedDiscovery": not missing, "rolledBackStagedFiles": bool(missing),
        "verdict": "UNASSESSED_READ_FRESH_JUNIT_AND_COMPILER_LOG",
        "files": [{"path": str(path.relative_to(root)),
                   "beforeSha256": sha(backups[path]) if backups[path] is not None else None,
                   "stagedSha256": sha(data),
                   "afterSha256": sha(path.read_bytes()) if path.exists() else None}
                  for path, data in changes.items()], "command": run}, indent=2) + "\n")
raise SystemExit(collector_exit if collector_exit is not None else 1)
