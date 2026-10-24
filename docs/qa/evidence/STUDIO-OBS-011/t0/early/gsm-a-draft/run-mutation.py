#!/usr/bin/env python3
"""UNEXECUTED draft helper; caller must hold execute-008 lock after root releases all barriers."""
import argparse
import hashlib
import json
import re
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("mutant", choices=("warn-every-call", "warn-never", "refused-to-pending"))
parser.add_argument("label")
parser.add_argument("--root-proof-barrier-released", action="store_true", required=True)
args = parser.parse_args()
root = Path.cwd()
draft = Path(__file__).resolve().parent
manifest = json.loads((draft / "manifest.json").read_text())
for fact in manifest["files"]:
    real = root / fact["path"]
    if not real.is_file() or hashlib.sha256(real.read_bytes()).hexdigest() != fact["draftSha256"]:
        raise SystemExit("Rebase/review the mutation after the five-file source changes: " + fact["path"])
if not args.label.startswith("obs011-") or not re.fullmatch(r"[A-Za-z0-9_-]+", args.label):
    raise SystemExit("Use a fresh obs011- label")
results = root / "docs/qa/evidence/STUDIO-OBS-011/execution"
if (results / (args.label + "-results.json")).exists():
    raise SystemExit("Evidence label already exists")
receipt = results / "gs-m" / (args.label + "-mutation.json")
if receipt.exists():
    raise SystemExit("Mutation receipt already exists")
receipt.parent.mkdir(parents=True, exist_ok=True)
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
}[args.mutant]
source = original.decode()
if source.count(old) != 1:
    raise SystemExit("Mutation anchor is not unique")
mutated = source.replace(old, new).encode()
class_name = ("GuidedResultPublicationDisabledIT" if args.mutant == "refused-to-pending"
              else "GuidedTeardownShedTest")
command = [sys.executable, ".aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py",
           args.label, "--test-tasks", "test", "--", "test", "--tests",
           "com.citi.put.checks.studio.guided.session." + class_name, "--no-daemon"]
collector_exit = None
try:
    service.write_bytes(mutated)
    with (receipt.parent / (args.label + "-listeners.txt")).open("x") as listeners:
        subprocess.run(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN"], stdout=listeners, check=False)
    collector_exit = subprocess.run(command, cwd=root, check=False).returncode
finally:
    service.write_bytes(original)
    restored = hashlib.sha256(service.read_bytes()).hexdigest()
    expected = hashlib.sha256(original).hexdigest()
    receipt.write_text(json.dumps({"mutant": args.mutant, "label": args.label,
        "beforeSha256": expected, "mutatedSha256": hashlib.sha256(mutated).hexdigest(),
        "restoredSha256": restored, "restoreMatches": restored == expected,
        "collectorExit": collector_exit, "redVerdict": "UNASSESSED_READ_NEW_TEST_ASSERTIONS",
        "command": command}, indent=2) + "\n")
    if restored != expected:
        raise RuntimeError("Restored source hash differs")
raise SystemExit(collector_exit if collector_exit is not None else 1)
