from pathlib import Path
import hashlib, json, re, subprocess

base = Path(__file__).resolve().parent
root = next(parent for parent in base.parents if (parent / "helm-chart/put-checks").is_dir())
manifest = json.loads((base / "manifest.json").read_text())
proof = json.loads((base / "source-proof.json").read_text())
sha = lambda data: hashlib.sha256(data).hexdigest()
checks = []
for item in manifest["files"]:
    old = (base / "originals" / item["path"]).read_bytes()
    new = (base / "repo" / item["path"]).read_bytes()
    actual = (root / item["path"]).read_bytes()
    assert sha(old) == item["originalSha256"] == sha(actual), item["path"]
    assert sha(new) == item["draftSha256"], item["path"]
    patch = (base / item["patch"]).read_text().splitlines(keepends=True)
    assert sha((base / item["patch"]).read_bytes()) == item["patchSha256"]
    lines = old.decode().splitlines(keepends=True)
    output = []
    cursor = 0
    index = 2
    while index < len(patch):
        match = re.fullmatch(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*\n", patch[index])
        assert match, patch[index]
        start = int(match[1]) - 1
        assert start >= cursor
        output.extend(lines[cursor:start])
        cursor = start
        index += 1
        removed = added = 0
        while index < len(patch) and not patch[index].startswith("@@"):
            line = patch[index]
            assert line[0] in " +-", line
            if line[0] in " -":
                assert lines[cursor] == line[1:]
                cursor += 1
                removed += 1
            if line[0] in " +":
                output.append(line[1:])
                added += 1
            index += 1
        assert removed == int(match[2] or 1)
        assert added == int(match[4] or 1)
    output.extend(lines[cursor:])
    assert "".join(output).encode() == new
    checks.append({"path": item["path"], "actualUnchanged": True, "exactPatchReconstruction": True})

old = (base / "originals/helm-chart/put-checks/templates/_helpers.tpl").read_text()
new = (base / "repo/helm-chart/put-checks/templates/_helpers.tpl").read_text()
extract = lambda text: re.findall(r'"([a-z0-9]+)"', text.split('{{- define "put-checks.springConfig.validateProperties" -}}')[1].split('-}}')[0])
before = extract(old)
after = extract(new)
expected = proof["newNormalizedTokens"]
assert len(expected) == 8 and len(set(expected)) == 8
assert set(after) - set(before) == set(expected)
assert set(before) - set(after) == set()
assert all(before.count(token) == after.count(token) for token in before)
assert all(after.count(token) == 1 for token in expected)
assert len(proof["legacyNormalizedTokens"]) == 7
assert len(proof["apiDedicatedGatewayEnv"]) == 7
assert proof["workerDedicatedGatewayEnv"] == []

# Check the entire helper delta, beyond just its token census.
comment = '{{/* Current studio.gateway facts emitted from studioGateway.* are reserved together with the\n     credentials placeholder alias; the old compile spellings remain denied below. */}}\n'
stripped = new.replace(comment, '')
stripped = ''.join(line for line in stripped.splitlines(keepends=True) if not any('"' + token + '"' in line for token in expected))
assert stripped == old
oldtest = (base / "originals/studio-runner/test/deployment/integrations.test.ts").read_text()
newtest = (base / "repo/studio-runner/test/deployment/integrations.test.ts").read_text()
assert oldtest[oldtest.index('/**'):] == newtest[newtest.index('/**'):newtest.index('// Only facts with dedicated studioGateway values')].rstrip() + '\n'

patch = base / "gateway-chart-draft.patch"
assert sha(patch.read_bytes()) == manifest["combinedPatchSha256"]
run = subprocess.run(["patch", "--dry-run", "--batch", "-p1", "-i", str(patch)], cwd=root, capture_output=True, text=True)
assert run.returncode == 0, run.stdout + run.stderr
assert not re.search(r"fuzz|offset", run.stdout + run.stderr, re.I)
result = {"kind": "static only", "checks": checks, "addedProtectedTokens": expected,
          "allLegacyAndUnrelatedTokensPreserved": True, "allOriginalTestBodiesUnchanged": True,
          "wholeHelperDeltaLimitedToCommentAndEightTokens": True,
          "predictedNewTestCasesNotCollected": {"negativeCurrent": 48, "negativeLegacy": 14, "allowedTuning": 2, "tokenMutations": 8, "validManifestEquality": 8, "total": 80},
          "patchApplicability": {"command": run.args, "exit": run.returncode, "stdout": run.stdout, "stderr": run.stderr, "noFuzzOrOffset": True},
          "notExecuted": ["Helm", "Node", "type-check", "lint", "Vitest", "Docker", "runtime binding", "red/green", "template mutations", "valid rendered manifest equality"]}
(base / "static-checks.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
