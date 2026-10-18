"""Design arithmetic/patch validation only. No application import or implementation execution."""
from pathlib import Path
import copy
import hashlib
import json
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[5]


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canon(value):
    # The inspected schema bundle has ASCII object keys and JSON integer/scalar values.
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


issue = read(HERE / "issue.json")
patch = read(HERE / "patch-map.json")
tests = read(HERE / "test-mapping.json")
observations = read(HERE / "source-observations.json")
base = ROOT / "docs/specs/studio-observed-authoring/contracts/v3"
before = read(base / "replay-ipc.schema.json")
after = copy.deepcopy(before)
execute = after["definitions"]["Execute3"]
assert execute["additionalProperties"] is False
assert "retainedArtifact" not in execute["properties"]
expected = {"$ref": "https://checks.citi.example/contracts/observed/v3/replay-artifact.schema.json"}
execute["properties"]["retainedArtifact"] = expected
assert execute["required"] == before["definitions"]["Execute3"]["required"]
undo = copy.deepcopy(after)
del undo["definitions"]["Execute3"]["properties"]["retainedArtifact"]
assert undo == before
assert patch["schema"]["jsonPatch"][1]["value"] == expected
raw = read(base / "guided-model-response.schema.json")
assert raw["oneOf"][0]["properties"]["needs"]["items"]["properties"]["consumers"]["minItems"] == 1
assert sha(base / "guided-model-response.schema.json") == "2d986c098548b604d6fe75a3597397eabe325705550a78286e76ae5ae2a176ca"
bundle = read(ROOT / "studio-runner/src/validator/observedSchemas.json")
bundle_hash = hashlib.sha256(canon(bundle).encode()).hexdigest()
assert bundle_hash == issue["generatedBundleBefore"]
assert "replay-validation" in bundle and "replay-ipc" in bundle
arithmetic = patch["sizeArithmetic"]
sample = {"kind": "execute", "input": "escaped\n Unicode 雪"}
proof = {"version": 3}
combined = dict(sample, retainedArtifact=proof)
overhead = len(canon(combined).encode()) - len(canon(sample).encode()) - len(canon(proof).encode())
assert overhead == arithmetic["actualWrapperBytes"] == 20
assert arithmetic["proofCombinedBytes"] == arithmetic["ordinaryExecuteBytes"] + arithmetic["retainedArtifactBytes"] + 64
assert arithmetic["extraHeadroomBytes"] == 64 - overhead
assert len({row["id"] for row in tests["rows"]}) == len(tests["rows"])
assert all(row["status"] == "PLANNED_NOT_RUN" for row in tests["rows"])
assert tests["counts"] == {"positiveFacets": 8, "negativeFacets": 14, "contractFacets": 2}
assert all(issue[key] == 0 for key in ["applicationTestsExecuted", "databaseCommandsExecuted", "browserCommandsExecuted", "buildCommandsExecuted", "generatorCommandsExecuted"])
ruling = (HERE / "ruling.md").read_text()
for phrase in ["independent Quinn", "Orion", "hashObserved", "retainedPrefixAdmissionIds", "raw model", "hidden history", "startDeadline", "3145792", "No model call", "not authentication"]:
    assert phrase.lower() in ruling.lower(), phrase
drift = [path for path, expected_sha in observations["files"].items() if sha(ROOT / path) != expected_sha]
result = {
    "artifact": "ARCH015-05 bounded design validation",
    "status": "PASS_DESIGN_ONLY",
    "checks": ["only in-memory schema property added; required and closed fields unchanged", "raw model full hash and consumers minimum unchanged", "current full canonical bundle equals ce58 baseline and includes replay-validation", "exact JSON wrapper20bytes; old frame2MiB + artifact1MiB +64headroom", "complete 8positive/14negative/2contract facets remain planned", "explicit authority/limit/lifetime/release statements"],
    "canonicalBundleBefore": bundle_hash,
    "sourceDiagnosticDriftAtValidation": drift,
    "harnessHistory": "Initial design validator resolved root one parent too high and stopped on FileNotFoundError before validation or writes; corrected to HERE.parents[5]. No product source or schema failure was observed or waived.",
    "applicationTestsExecuted": 0,
    "databaseCommandsExecuted": 0,
    "browserCommandsExecuted": 0,
    "buildCommandsExecuted": 0,
    "generatorCommandsExecuted": 0,
    "qualification": "Standard-library in-memory design/manifest checks only. Not a schema semantic oracle, application test, authentication proof, source release, story QA or lifecycle completion. Active source hashes are diagnostic."
}
if "--freeze" in sys.argv:
    assert not (HERE / "manifest.json").exists(), "Immutable manifest already frozen"
    (HERE / "design-check-result.json").write_text(json.dumps(result, indent=2) + "\n")
    names = ["ruling.md", "issue.json", "patch-map.json", "test-mapping.json", "source-observations.json", "check-design.py", "design-check-result.json"]
    manifest = {
        "artifact": "ARCH015-05 immutable design manifest",
        "status": "DESIGN_ONLY_PENDING_INDEPENDENT_QUINN_MAPPING_AND_ORION_RELEASE",
        "story": "STUDIO-OBS-015",
        "generationBaseline": bundle_hash,
        "files": {name: sha(HERE / name) for name in names},
        "releaseBlockers": ["Independent Quinn review of exact manifest/hash and mapping", "Orion explicit held-delta/C-int release", "Authorized C-int source-schema mini-generation, all dependent commitments/pins and frozen after receipt", "Owned runner/backend implementation and actual existing positive/negative/ordinary replay acceptance execution"],
        "notClaimed": ["production/source/schema/test edits", "generator/build/database/native execution", "implementation or story QA green", "story lifecycle change"],
        "scope": "Only this directory written; no prior artifact rewritten. Independent QA writes a separate review binding this manifest hash."
    }
    (HERE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
manifest = read(HERE / "manifest.json")
assert all(sha(HERE / name) == expected_sha for name, expected_sha in manifest["files"].items())
print(json.dumps({"status": result["status"], "manifestSHA256": sha(HERE / "manifest.json"), "filesBound": len(manifest["files"]), "sourceDiagnosticDrift": drift, "applicationExecution": False}))
