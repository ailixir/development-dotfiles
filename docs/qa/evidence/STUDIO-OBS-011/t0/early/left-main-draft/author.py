from pathlib import Path
import difflib, hashlib, json, re
ROOT = Path.cwd()
OUT = ROOT / "docs/qa/evidence/STUDIO-OBS-011/t0/early/left-main-draft"
BASE = "backend/src/main/java/com/citi/put/checks/studio/"
sha = lambda s: hashlib.sha256(s.encode()).hexdigest()
changes = {}

def put_json(name, data):
    (OUT / name).write_text(json.dumps(data, indent=2) + "\n")

def change(path, old, new, rationale):
    if path not in changes:
        text = (ROOT / path).read_text()
        changes[path] = {"before": text, "after": text, "edits": []}
    c = changes[path]
    assert c["after"].count(old) == 1, (path, rationale)
    c["after"] = c["after"].replace(old, new, 1)
    c["edits"].append({"before": old, "after": new, "rationale": rationale})

change(BASE+"dto/ExecutionStatus.java", "  private static final Set<String> CANONICAL = Set.of(PENDING, RUNNING, PASSED, FAILED, ERROR);\n\n", "", "CLN-19 unused canonical set")
change(BASE+"dto/ExecutionStatus.java", "  public static boolean isCanonical(String status) {\n    return status != null && CANONICAL.contains(status);\n  }\n\n", "", "CLN-19 unused method")
path=BASE+"guided/translation/GuidedSourceInputResolver.java"
text=(ROOT/path).read_text()
start=text.index("  /** Safe correlation is provenance based; private values never enter the result. */")
change(path, text[start-1:text.rfind("}\n")], "", "CLN-21 unused allocationIds method only")
change(path,"import java.util.Map;\n", "", "Map import used only by allocationIds")
path=BASE+"internal/RunnerOutcomeCodes.java"
change(path, "import java.util.Set;\n", "", "Set import used only by API_ASSIGNED")
text=(ROOT/path).read_text()
start=text.index("  /**\n   * Codes the API assigns")
end=text.index("  private RunnerOutcomeCodes()",start)
change(path,text[start:end], "", "CLN-21 unused API_ASSIGNED field and comment")
start=text.index("  /** True when a runner emitted a code the API reserves for itself")
change(path,text[start-1:text.rfind("}\n")], "", "CLN-21 unused isApiAssigned method only")
path=BASE+"secrets/VaultStudioReferenceResolver.java"
text=(ROOT/path).read_text()
start=text.index("  /** Visible so a test can assert which provider a running context actually selected")
change(path,text[start-1:text.rfind("}\n")], "", "CLN-21 unused providerName method only")
change(path,"import java.util.Optional;\n", "", "Optional import used only by providerName")
path=BASE+"secrets/SecretAlreadyExistsException.java"
change(path,"  private final String secretName;\n\n", "", "CLN-21 unused exception stored name")
change(path,"    this.secretName = secretName;\n", "", "Remove sole assignment to removed stored name; preserve super message")
change(path,"\n  public String getSecretName() {\n    return secretName;\n  }\n", "", "CLN-21 unused getter; exception class/constructor remain")
path=BASE+"StudioExecutionProperties.java"
change(path,"      Boolean enabled, Integer threads, Integer batchSize, Duration lease, Duration pollInterval)","      Boolean enabled, Integer threads, Integer batchSize, Duration lease)","CLN-21 unused Dispatcher record component; retained order")
change(path,"\n    public Duration pollIntervalOrDefault() {\n      return pollInterval == null ? Duration.ofSeconds(2) : pollInterval;\n    }\n", "", "CLN-21 unused Dispatcher accessor")
change(path,"      Duration readInterval,\n", "", "CLN-21 unused Sse record component; retained order")
change(path,"    public Duration readIntervalOrDefault() {\n      return readInterval == null ? Duration.ofMillis(750) : readInterval;\n    }\n\n", "", "CLN-21 unused Sse accessor")
change(path,"new Dispatcher(null, null, null, null, null)","new Dispatcher(null, null, null, null)","C6 owner default constructor arity 5 to 4")
change(path,"new Sse(null, null, null, null, null, null, null, null)","new Sse(null, null, null, null, null, null, null)","C6 owner default constructor arity 8 to 7")
path="backend/src/test/java/com/citi/put/checks/studio/dispatch/StudioKillSwitchWiringTest.java"
change(path,"new StudioExecutionProperties.Dispatcher(false, null, null, null, null)","new StudioExecutionProperties.Dispatcher(false, null, null, null)","C6/RC-3 approved sole test arity edit; final null only")
path=BASE+"StudioService.java"
text=(ROOT/path).read_text()
start=text.index("  /** Alias matching the existing update naming used by repository/service callers. */")
end=text.index("  /** Private metadata engine;", start)
change(path,text[start:end],"","CLN-20 updateAuthoring alias only; saveAuthoring/updateMetadata untouched")
path=BASE+"secrets/StudioSecretsService.java"
change(path,"   * Upper bound on a value, in UTF-16 units. With the worst-case JSON escaping and the origin list,\n   * a stored entry stays under the 64 KiB read cap it must later be read back through.\n", "   * Upper bound on a value, in UTF-16 units, aligned with the dispatch value bound by\n   * STUDIO-OBS-007 AC-12 (security finding F-5).\n", "C-OBS008-2 correct source rationale; Javadoc only")
path="backend/src/main/resources/application.yml"
change(path,"      read-interval: ${STUDIO_SSE_READ_INTERVAL:750ms}\n", "", "CLN-21 only bound-but-unread SSE YAML leaf; scheduler millis unchanged")
path="backend/build.gradle.kts"
text=(ROOT/path).read_text()
start=text.index("        // Story 10.5 AC-15: the R2D2 gateway client carries a higher bar")
end=text.index("        // Story 10.7 AC-40:",start)
change(path,text[start:end], "", "R-J retired studio.compile.gateway JaCoCo rule only")
start=text.index("        // Story 10.9 AC-23: the compile package is this story's main new surface")
end=text.index("\n    }\n}",start)
change(path,text[start:end+1],"", "R-J retired studio.compile JaCoCo rule only")
# Include the now-superfluous blank between final rule and violationRules closing only
# as part of the removed compile-rule block; all other Gradle bytes stay equal.

manifest=[]
patch=[]
for path,c in changes.items():
    for directory,key in [("originals","before"),("repo","after")]:
        target=OUT/directory/path
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(c[key])
    restored=c["after"]
    # Use inverse composition to prove exact edits and no incidental bytes.
    # Empty replacements are ambiguous; forward sequential exact replacement is authoritative.
    replay=c["before"]
    for e in c["edits"]:
        assert replay.count(e["before"]) == 1
        replay=replay.replace(e["before"],e["after"],1)
    assert replay==c["after"]
    hunk="".join(difflib.unified_diff(c["before"].splitlines(True),c["after"].splitlines(True),fromfile="a/"+path,tofile="b/"+path))
    patch.append(hunk)
    manifest.append({"path":path,"operation":"edit","beforeSha256":sha(c["before"]),"afterSha256":sha(c["after"]),"edits":c["edits"]})
(OUT/"left-main-draft.patch").write_text("".join(patch))
put_json("manifest.json",{"draftOnly":True,"budgetUsdDeclared":500,"actualSpend":"unavailable","files":manifest,"patchSha256":sha("".join(patch))})
