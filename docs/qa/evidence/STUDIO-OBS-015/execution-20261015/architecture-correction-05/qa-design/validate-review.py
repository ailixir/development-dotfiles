"""Independent QA design checks only; no product imports, generator, or application tests."""
from pathlib import Path
import copy
import hashlib
import json

HERE = Path(__file__).resolve().parent
DESIGN = HERE.parent
ROOT = next(p for p in HERE.parents if (p / "studio-runner/src/executor/observedReplay.ts").exists())


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canon(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


manifest = read(DESIGN / "manifest.json")
assert all(sha(DESIGN / name) == expected for name, expected in manifest["files"].items())
addendum = read(DESIGN / "addendum-01/manifest.json")
assert sha(DESIGN / "addendum-01/manifest.json") == "e8880e8b5673fa574e2b9e2dc0adf51c3e2993e385c787823206ef49b7a21589"
assert addendum["parentManifestSHA256"] == sha(DESIGN / "manifest.json")
assert all(sha(DESIGN / "addendum-01" / name) == expected for name, expected in addendum["files"].items())
contracts = ROOT / "docs/specs/studio-observed-authoring/contracts/v3"
ipc = read(contracts / "replay-ipc.schema.json")
execute = ipc["definitions"]["Execute3"]
assert execute["additionalProperties"] is False
assert "retainedArtifact" not in execute["properties"]
patched = copy.deepcopy(ipc)
patched["definitions"]["Execute3"]["properties"]["retainedArtifact"] = {
    "$ref": "https://checks.citi.example/contracts/observed/v3/replay-artifact.schema.json"
}
assert patched["definitions"]["Execute3"]["required"] == execute["required"]
del patched["definitions"]["Execute3"]["properties"]["retainedArtifact"]
assert patched == ipc
artifact = read(contracts / "replay-artifact.schema.json")
assert artifact["additionalProperties"] is False
raw_model = contracts / "guided-model-response.schema.json"
assert sha(raw_model) == "2d986c098548b604d6fe75a3597397eabe325705550a78286e76ae5ae2a176ca"
assert read(raw_model)["oneOf"][0]["properties"]["needs"]["items"]["properties"]["consumers"]["minItems"] == 1
bundle = read(ROOT / "studio-runner/src/validator/observedSchemas.json")
bundle_hash = hashlib.sha256(canon(bundle).encode()).hexdigest()
assert bundle_hash == manifest["generationBaseline"] == "ce58d620c27bb84f4233151275373aba24467f748c7152a12f1ef3d2d85381aa"
assert "replay-ipc" in bundle and "replay-validation" in bundle and "replay-artifact" in bundle
for name in ["replay-ipc", "replay-artifact", "learned-plan", "binding", "replay-validation"]:
    assert bundle[name] == read(contracts / (name + ".schema.json"))
for sample in [{"kind": "execute"}, {"kind": "execute", "input": "雪\n\\\""}]:
    proof = {"learned": "雪\n\\\""}
    assert len(canon(dict(sample, retainedArtifact=proof)).encode()) - len(canon(sample).encode()) - len(canon(proof).encode()) == 20
assert 2097152 + 1048576 + 64 == 3145792
rows = read(DESIGN / "test-mapping.json")["rows"]
assert {r["id"] for r in rows} == {f"P{i:02}" for i in range(1, 9)} | {f"N{i:02}" for i in range(1, 15)} | {"C01", "C02"}
assert len(rows) == 24 and all(r["status"] == "PLANNED_NOT_RUN" for r in rows)
sources = read(DESIGN / "source-observations.json")["files"]
drift = {name: {"aria": expected, "current": sha(ROOT / name)} for name, expected in sources.items() if sha(ROOT / name) != expected}
result = {
    "status": "PASS_READ_ONLY_DESIGN_VALIDATION",
    "designManifestSHA256": sha(DESIGN / "manifest.json"),
    "designFilesVerified": len(manifest["files"]),
    "addendumManifestSHA256": sha(DESIGN / "addendum-01/manifest.json"),
    "addendumFilesVerified": len(addendum["files"]),
    "canonicalBundleSHA256": bundle_hash,
    "schemaDelta": "one optional existing Artifact3 reference; required/closed fields and all other source-schema bytes preserved",
    "rawModelSHA256": sha(raw_model),
    "wrapperBytes": 20,
    "ordinaryExecuteBytes": 2097152,
    "artifactBytes": 1048576,
    "combinedProofFrameBytes": 3145792,
    "plannedMappingRows": 24,
    "sourceDiagnosticDrift": drift,
    "applicationTestsExecuted": 0,
    "databaseCommandsExecuted": 0,
    "nativeCommandsExecuted": 0,
    "buildCommandsExecuted": 0,
    "generatorCommandsExecuted": 0,
    "qualification": "Independent standard-library manifest/schema-structure/arithmetic checks only. No application semantic oracle or historical/authentication proof."
}
print(json.dumps(result, indent=2))
