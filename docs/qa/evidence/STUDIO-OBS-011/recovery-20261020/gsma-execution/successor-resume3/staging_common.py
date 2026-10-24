"""Future application guardrails. Importing does not apply changes or start tools."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess


def sha(data):
    return hashlib.sha256(data).hexdigest()


def plain_path(path, root):
    """Refuse symlinks in each existing component before any write."""
    path = Path(path)
    path.relative_to(root)
    for current in (path, *path.parents):
        if current.is_symlink():
            raise SystemExit("Symlink is not an application target: " + str(current))
        if current == root:
            return path
    raise SystemExit("Path outside root")


def preflight(draft, root, label):
    plain_path(draft, root)
    for line in (draft / "artifact-hashes.sha256").read_text().splitlines():
        digest, name = line.split("  ", 1)
        relative = Path(name)
        if relative.is_absolute() or ".." in relative.parts:
            raise SystemExit("Invalid artifact path")
        path = plain_path(draft / relative, root)
        if not path.is_file() or sha(path.read_bytes()) != digest:
            raise SystemExit("Stale or changed draft artifact: " + name)
    manifest = json.loads((draft / "manifest.json").read_text())
    parent = subprocess.check_output(
        ["ps", "-p", str(os.getppid()), "-o", "command="], text=True).strip()
    wrapper = root / ".aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py"
    if str(wrapper.relative_to(root)) not in parent and str(wrapper) not in parent:
        raise SystemExit("Caller must be the execute-008 with-gradle-lock.py wrapper")
    lock = plain_path(wrapper.with_name("gradle.lock"), root)
    with lock.open("a+") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            pass
        else:
            fcntl.flock(handle, fcntl.LOCK_UN)
            raise SystemExit("Expected caller-held Gradle lock is not held")
    if not label.startswith("obs011-") or not re.fullmatch(r"[A-Za-z0-9_-]+", label):
        raise SystemExit("Use a fresh obs011- label")
    results = plain_path(root / "docs/qa/evidence/STUDIO-OBS-011/execution", root)
    receipts = plain_path(results / "gs-m", root)
    if list(results.glob(label + "*")) or list(receipts.glob(label + "*")):
        raise SystemExit("Evidence label already exists")
    # Staging artifacts must remain SHA-bound even when human-readable patches are not applied.
    for fact in manifest["files"]:
        data = plain_path(draft / "repo" / fact["path"], root).read_bytes()
        if sha(data) != fact["draftSha256"]:
            raise SystemExit("Draft manifest mismatch: " + fact["path"])
    pin = manifest["readOnlyFallbackPin"]
    if sha(plain_path(root / pin["path"], root).read_bytes()) != pin["sha256"]:
        raise SystemExit("Read-only legacy fallback pin changed")
    return manifest, results, receipts


def required_cases(manifest, classes):
    return {(item["class"], name) for item in manifest["expectedCases"]
            if item["class"] in classes for name in item["names"]}


def fresh_cases(result, expected):
    report = json.loads(result.read_text()) if result.exists() else {}
    actual = {(case.get("class"), re.sub(r"\(\)$", "", case.get("name", "")))
              for case in report.get("testcases", [])}
    return sorted(expected - actual)


def command(label, classes):
    import sys
    args = [sys.executable,
            ".aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py",
            label, "--test-tasks", "test", "--", "test"]
    for name in classes:
        args += ["--tests", name]
    return args + ["--no-daemon"]
