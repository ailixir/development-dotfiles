#!/usr/bin/env python3
"""UNEXECUTED staging draft. Run only under execute-008 lock after root releases all barriers."""
import argparse
import hashlib
import json
import re
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("stage", choices=("red", "green"))
parser.add_argument("label")
parser.add_argument("--root-proof-barrier-released", action="store_true", required=True)
args = parser.parse_args()
root = Path.cwd()
draft = Path(__file__).resolve().parent
manifest = json.loads((draft / "manifest.json").read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
service_path = "backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java"
neutral = (draft / "red-seam-reference.java.txt").read_bytes()
changes = {}
for fact in manifest["files"]:
    path = root / fact["path"]
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
    elif "/src/main/" in fact["path"]:
        changes[path] = (draft / "repo" / fact["path"]).read_bytes()
if not args.label.startswith("obs011-") or not re.fullmatch(r"[A-Za-z0-9_-]+", args.label):
    raise SystemExit("Use a fresh obs011- label")
results = root / "docs/qa/evidence/STUDIO-OBS-011/execution"
result = results / (args.label + "-results.json")
receipt = results / "gs-m" / (args.label + "-stage.json")
if result.exists() or receipt.exists():
    raise SystemExit("Evidence label already exists")
receipt.parent.mkdir(parents=True, exist_ok=True)
backups = {path: path.read_bytes() if path.exists() else None for path in changes}
class_root = "com.citi.put.checks.studio.guided."
classes = [class_root + "session.GuidedTeardownShedTest"]
if args.stage == "green":
    classes += [class_root + "session.GuidedResultPublicationDisabledIT",
                class_root + "retention.GuidedObservationPrunerIT"]
command = [sys.executable, ".aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py",
           args.label, "--test-tasks", "test", "--", "test"]
for class_name in classes:
    command += ["--tests", class_name]
command += ["--no-daemon"]
observed_selected_cases = False
collector_exit = None
try:
    for path, data in changes.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    with (receipt.parent / (args.label + "-listeners.txt")).open("x") as listeners:
        subprocess.run(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN"], stdout=listeners, check=False)
    collector_exit = subprocess.run(command, cwd=root, check=False).returncode
    report = json.loads(result.read_text()) if result.exists() else {}
    selected = [case for case in report.get("testcases", []) if case.get("class") in classes]
    observed_selected_cases = any(case.get("name") in {
        "shedWarnsOncePerIntervalAndTheNextTickKeepsOneDurableAttempt",
        "anIdAlreadyQueuedOrInFlightIsNeverSubmittedTwice",
    } for case in selected)
finally:
    # A compiler/discovery/collector failure must not leave half-applied sources at lock release.
    # Test outcomes (including expected assertion-red) are assessed separately from source staging.
    if not observed_selected_cases:
        for path, data in backups.items():
            if data is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(data)
    receipt.write_text(json.dumps({"stage": args.stage, "label": args.label,
        "collectorExit": collector_exit, "freshSelectedTestcasesObserved": observed_selected_cases,
        "rolledBackStagedFiles": not observed_selected_cases,
        "verdict": "UNASSESSED_READ_FRESH_JUNIT_AND_COMPILER_LOG",
        "files": [{"path": str(path.relative_to(root)),
                   "beforeSha256": sha(backups[path]) if backups[path] is not None else None,
                   "stagedSha256": sha(data),
                   "afterSha256": sha(path.read_bytes()) if path.exists() else None}
                  for path, data in changes.items()], "command": command}, indent=2) + "\n")
raise SystemExit(collector_exit if collector_exit is not None else 1)
