#!/usr/bin/env bash
# STUDIO-OBS-015 final source-frozen gates — REFERENCE SCRIPT (prepared by Gage, 2026-10-16).
# NOT EXECUTED. Read runbook.md first. Run one step function at a time, in runbook order, only after
# root releases the window:   FINAL_GATES_RUNBOOK_ARMED=yes bash commands.sh <step_function> [args]
# Long steps (s06b_backend_final_check) are meant for a harness background job.
set -euo pipefail

ROOT=/Users/brunobuger/orca/workspaces/put-checks/ui-studio
ORCH=$ROOT/.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-015-008
CAP=$ROOT/.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py
OUT=$ROOT/docs/qa/evidence/STUDIO-OBS-015/execution-20261015/execution      # fixed by the wrappers
FGREL=docs/qa/evidence/STUDIO-OBS-015/execution-20261015/final-gates01
FG=$ROOT/$FGREL                                                              # hand-captured receipts
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home   # same as run-backend.py
PNPM=(pnpm --config.package-manager-strict=false)                            # never pass '--' before script args
GW=(caffeinate -i ./gradlew --no-daemon)
TAG=put-checks-studio-runner:obs015-final01-local
BTAG=put-checks-studio-runner:obs015-final01-buildstage-local
SKIPS_REL=$FGREL/approved-historical-skips.json                              # written by Quinn in s02b, never by Gage

cd "$ROOT"   # wrappers and capture-manifest.py resolve paths from the repo root

# ---------- helpers ----------
capture() { python3 "$CAP" "$1"; }   # whole-repo source + studio-runner/dist manifest
run_rc() { local rcfile=$1; shift; set +e; "$@"; local rc=$?; set -e; echo "$rc" >"$rcfile"; return 0; }
gradle_logged() {   # gradle_logged <logfile> <gradle args...>; exit code -> <logfile>.exit
  local log=$1; shift
  run_rc "$log.exit" bash -c 'cd "$0/backend" && "${@}"' "$ROOT" "${GW[@]}" "$@" >"$log" 2>&1
  echo "gradle $* -> exit $(cat "$log.exit")"
}
manifest_diff() {   # manifest_diff <before.json> <after.json>  -> JSON to stdout
  python3 - "$1" "$2" <<'PY'
import json,sys
a,b=(json.load(open(p)) for p in sys.argv[1:3])
fa={f['path']:f['sha256'] for f in a['files']}; fb={f['path']:f['sha256'] for f in b['files']}
print(json.dumps({'sourceDigestBefore':a['digest'],'sourceDigestAfter':b['digest'],
  'distDigestBefore':a.get('dist',{}).get('digest'),'distDigestAfter':b.get('dist',{}).get('digest'),
  'changed':sorted(p for p in fa.keys()&fb.keys() if fa[p]!=fb[p]),
  'added':sorted(fb.keys()-fa.keys()),'removed':sorted(fa.keys()-fb.keys())},indent=2))
PY
}
checkstyle_counts() {   # parse Gradle checkstyle HTML summaries
  python3 - "$ROOT/backend/build/reports/checkstyle" <<'PY'
import re,sys,os,json
out={}
for s in ('main','test'):
  p=os.path.join(sys.argv[1],s+'.html')
  if not os.path.isfile(p): out[s]=None; continue
  t=re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',open(p).read()))
  m=re.search(r'Total files checked Total violations Files with violations (\d+) (\d+) (\d+)',t)
  out[s]={'files':int(m.group(1)),'violations':int(m.group(2)),'filesWithViolations':int(m.group(3))} if m else 'unparsed'
print(json.dumps(out))
PY
}

# ---------- step 0: preflight (read-only) ----------
s00_preflight() {
  mkdir -p "$FG"
  ps -axo pid,ppid,etime,command | grep -E 'run-backend|run-runner|GradleWrapperMain|gradlew|vitest|eslint' | grep -v grep >"$FG/s00-processes.txt" || true
  if grep -E 'run-backend|run-runner|GradleWrapperMain' "$FG/s00-processes.txt" | grep -q "$ROOT"; then
    echo "A wrapper/Gradle process from this workspace is still live; wait for terminal + cleanup." >&2; exit 1
  fi
  { git rev-parse HEAD; node --version; (cd / && pnpm --version); docker version --format '{{.Server.Version}}';
    helm version --short; "$JAVA_HOME/bin/java" -version 2>&1 | head -1; } >"$FG/s00-env.txt" 2>&1
  capture "$FG/s00-preflight-manifest.json"
  for label in final-skipdisc01 final-sql55-attempt01 runner-final-typecheck01 runner-final-lint01 runner-final-unit01 \
               runner-final-pins01 runner-final-fixtures01 runner-final-deployment01 backend-final-check-attempt01; do
    if [[ -e "$OUT/$label-results.json" ]]; then echo "label $label already used; pick a new one" >&2; exit 1; fi
  done
  echo "preflight ok; never signal inherited PIDs (22246 etc.)"
}

# ---------- step 1: formatting window (exclusive writer, cross-owner format-only lease) ----------
s01a_fmt_baseline() {
  capture "$FG/fmt01-before.json"
  gradle_logged "$FG/fmt01-compile-before.log" compileJava compileTestJava
  tar czf "$FG/fmt01-classes-before.tgz" -C backend/build/classes java
}
s01b_spotless_apply() {   # arg: round label r1|r2|...
  local r=${1:-r1}
  gradle_logged "$FG/fmt01-spotlessApply-$r.log" spotlessApply
  capture "$FG/fmt01-after-apply-$r.json"
  manifest_diff "$FG/fmt01-before.json" "$FG/fmt01-after-apply-$r.json" >"$FG/fmt01-spotless-changed-$r.json"
}
s01c_spotless_check() { local r=${1:-r1}; gradle_logged "$FG/fmt01-spotlessCheck-$r.log" spotlessCheck; }
s01d_checkstyle() {
  local r=${1:-r1}
  gradle_logged "$FG/fmt01-checkstyle-$r.log" --continue checkstyleMain checkstyleTest
  mkdir -p "$FG/fmt01-checkstyle-$r"; cp backend/build/reports/checkstyle/*.html "$FG/fmt01-checkstyle-$r/" 2>/dev/null || true
  checkstyle_counts | tee "$FG/fmt01-checkstyle-$r-counts.json"
}
# Manual fixing happens between rounds (runbook §2.4). Then: s01b r2; s01c r2; s01d r2; ... until 0/0.
s01f_spotbugs() {
  gradle_logged "$FG/fmt01-spotbugs.log" spotbugsMain
  if [[ -d backend/build/reports/spotbugs ]]; then cp -R backend/build/reports/spotbugs "$FG/fmt01-spotbugs-reports"; fi
}
s01g_neutrality() {
  gradle_logged "$FG/fmt01-compile-after.log" compileJava compileTestJava
  tar czf "$FG/fmt01-classes-after.tgz" -C backend/build/classes java
  python3 - "$FG" "$JAVA_HOME/bin/javap" <<'PY'
import json,os,re,subprocess,sys,tarfile,tempfile
fg,javap=sys.argv[1:3]
def dump(tgz):
  d=tempfile.mkdtemp(); tarfile.open(tgz).extractall(d); res={}
  files=sorted(os.path.join(r,f) for r,_,fs in os.walk(d) for f in fs if f.endswith('.class'))
  for f in files:
    txt=subprocess.run([javap,'-c','-p',f],capture_output=True,text=True).stdout
    txt=re.sub(r'#\d+(,\s*#\d+)?','#',txt)            # constant-pool indices only; resolved names stay
    txt='\n'.join(l for l in txt.splitlines() if not l.startswith('Compiled from'))
    res[os.path.relpath(f,d)]=txt
  return res
a,b=dump(os.path.join(fg,'fmt01-classes-before.tgz')),dump(os.path.join(fg,'fmt01-classes-after.tgz'))
r={'identical':sum(1 for k in a.keys()&b.keys() if a[k]==b[k]),
   'different':sorted(k for k in a.keys()&b.keys() if a[k]!=b[k]),
   'onlyBefore':sorted(a.keys()-b.keys()),'onlyAfter':sorted(b.keys()-a.keys()),
   'method':'javap -c -p, constant-pool indices stripped, no line tables; differences expected only at restructured sites'}
open(os.path.join(fg,'fmt01-neutrality.json'),'w').write(json.dumps(r,indent=2)+'\n')
print(json.dumps({k:(len(v) if isinstance(v,list) else v) for k,v in r.items() if k!='method'}))
PY
}
s01h_freeze_source() {
  capture "$FG/final-source-frozen.json"
  manifest_diff "$FG/fmt01-before.json" "$FG/final-source-frozen.json" >"$FG/fmt01-total-diff.json"
  python3 -c 'import json;d=json.load(open("'"$FG"'/final-source-frozen.json"));print("S_F",d["digest"],"dist",d.get("dist",{}).get("digest"))'
}

# Fast iteration aid (scratch copies only; NOT a gate): fmt_fast_check backend/src/test/java/.../X.java ...
fmt_fast_check() {
  local C=~/.gradle/caches/modules-2/files-2.1 T; T=$(mktemp -d)
  local GJF="$(find $C/com.google.googlejavaformat/google-java-format/1.22.0 -name 'google-java-format-1.22.0.jar' | head -1):$(find $C/com.google.guava/guava/33.3.0-jre -name 'guava-33.3.0-jre.jar' | head -1):$(find $C/com.google.guava/failureaccess/1.0.2 -name 'failureaccess-1.0.2.jar' | head -1)"
  local CS="" p j
  for p in com.puppycrawl.tools/checkstyle/10.18.1 com.google.guava/guava/33.3.0-jre com.google.guava/failureaccess/1.0.2 \
           org.antlr/antlr4-runtime/4.13.2 commons-beanutils/commons-beanutils/1.9.4 info.picocli/picocli/4.7.6 \
           net.sf.saxon/Saxon-HE/12.5 org.reflections/reflections/0.10.2 org.javassist/javassist/3.28.0-GA \
           commons-collections/commons-collections/3.2.2 org.xmlresolver/xmlresolver/5.2.2 org.springframework/spring-jcl/6.1.14; do
    j=$(find "$C/$p" -name '*.jar' | grep -v -e sources -e javadoc -e '\-data' | head -1 || true); CS="$CS:$j"
  done
  echo "config_loc=$T/none" >"$T/cs.properties"
  for f in "$@"; do mkdir -p "$T/$(dirname "$f")"; cp "$f" "$T/$f"; done
  (cd "$T" && nice -n 19 "$JAVA_HOME/bin/java" -XX:ActiveProcessorCount=1 \
     --add-exports=jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED --add-exports=jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED \
     --add-exports=jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED --add-exports=jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED \
     --add-exports=jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED --add-exports=jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED \
     -cp "$GJF" com.google.googlejavaformat.java.Main --skip-sorting-imports --skip-reflowing-long-strings --replace "$@")
  (cd "$T" && nice -n 19 "$JAVA_HOME/bin/java" -cp "${CS#:}" com.puppycrawl.tools.checkstyle.Main \
     -c "$ROOT/backend/config/checkstyle/checkstyle.xml" -p "$T/cs.properties" "$@") | grep '^\[ERROR\]' \
     | sed -E 's#^\[ERROR\] '"$T"'/##' || true
  rm -rf "$T"
}

# ---------- step 2: backend preflight at S_F ----------
s02a_skip_discovery() {   # base wrapper: records SKIP statuses, has no skip policy
  run_rc "$FG/final-skipdisc01.exit" python3 "$ORCH/run-backend.py" final-skipdisc01 --no-daemon --continue test \
    --tests com.citi.put.checks.scheduling.SharedSchedulingIT \
    --tests com.citi.put.checks.studio.evidence.ExecutionVideoExternallyGatedCriteriaTest \
    --tests com.citi.put.checks.studio.guided.translation.GuidedProviderEvaluationTest \
    --tests com.citi.put.checks.studio.readiness.ExecutionReadinessTest \
    --tests com.citi.put.checks.studio.scheduling.StudioScheduleApiIT \
    --tests com.citi.put.checks.studio.secrets.ExternallyGatedCriteriaTest
  python3 - "$OUT/final-skipdisc01-results.json" "$FG/skip-candidates-final01.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]))
c=[{'task':'test','class':t['class'],'name':t['name']} for t in r['testcases'] if t['status']=='SKIP']
json.dump(c,open(sys.argv[2],'w'),indent=2); print(len(c),'skip candidates; Quinn decides approved-historical-skips.json')
PY
}
# s02b: Quinn (independent) writes $SKIPS_REL from the candidates. Gage never writes that file.
s02c_sql55() {
  python3 "$ORCH/run-backend-tasked.py" final-sql55-attempt01 --test-tasks test --require-exec-tasks test \
    -- --no-daemon test --tests com.citi.put.checks.studio.guided.GuidedReplayingPrefixMigrationIT
}   # expect exit 0, 55/55, zero skips

# ---------- step 3: runner read-only gates at S_F ----------
s03a_typecheck() { python3 "$ORCH/run-runner.py" runner-final-typecheck01 "${PNPM[@]}" run type-check; }
s03b_lint()      { python3 "$ORCH/run-runner.py" runner-final-lint01 "${PNPM[@]}" run lint; }
s03c_unit() {
  python3 "$ORCH/run-runner.py" runner-final-unit01 "${PNPM[@]}" run test \
    --reporter=default --reporter=json "--outputFile=$OUT/runner-final-unit01-vitest.json"
  cp studio-runner/coverage/coverage-summary.json "$FG/runner-final-unit01-coverage-summary.json"
}   # expect 2223 passed / 0 failed / 29 skipped, thresholds pass
s03d_contracts() {
  capture "$FG/contracts-final01-before.json"
  run_rc "$FG/contracts-final01.exit" node tools/check-studio-observed-contracts.cjs >"$FG/contracts-final01.log" 2>&1
  run_rc "$FG/codegen-check-final01.exit" node tools/build-studio-observed-schemas.cjs --check >"$FG/codegen-check-final01.log" 2>&1
  capture "$FG/contracts-final01-after.json"
  manifest_diff "$FG/contracts-final01-before.json" "$FG/contracts-final01-after.json" >"$FG/contracts-final01-nowrite.json"
}

# ---------- step 4: runner dist-writing gates (serial) ----------
s04a_build() {   # run-runner-build.py hard-codes npm; same capture done by hand
  capture "$FG/runner-final-build01-before.json"
  run_rc "$FG/runner-final-build01.exit" bash -c 'cd studio-runner && "$@"' _ "${PNPM[@]}" run build >"$FG/runner-final-build01.log" 2>&1
  capture "$FG/runner-final-build01-after.json"
  manifest_diff "$FG/runner-final-build01-before.json" "$FG/runner-final-build01-after.json" >"$FG/runner-final-build01-receipt.json"
  echo "build exit $(cat "$FG/runner-final-build01.exit")"; head -8 "$FG/runner-final-build01-receipt.json"
}   # expect exit 0, source unchanged; dist digest expected 060d9a53239c... if runner src unchanged since lint-cleanup01
s04b_pins_host() { python3 "$ORCH/run-runner.py" runner-final-pins01 "${PNPM[@]}" run check:pins; }
protect_fixture_media() {   # protect_fixture_media before|after <label>  (mirrors run-runner.py's --config branch)
  python3 - "$1" "$2" "$ROOT" "$FG" <<'PY'
import hashlib,json,shutil,sys
from pathlib import Path
phase,label,root,fg=sys.argv[1],sys.argv[2],Path(sys.argv[3]),Path(sys.argv[4])
scopes=[root/'docs/qa/evidence/STUDIO-OBS-007',root/'docs/qa/evidence/STUDIO-OBS-013/r13']
targets=[p for s in scopes for p in s.rglob('*') if p.is_file() and not p.is_symlink() and p.suffix.lower() in {'.json','.png','.webm','.jpg','.jpeg'}]
targets+=list((root/'docs/qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/runner-remediation').glob('kill-facts-*.json'))
before=fg/f'{label}-artifact-before'; after=fg/f'{label}-artifact-after'
if phase=='before':
  if before.exists(): sys.exit('backup dir exists; use a new label')
  for p in targets:
    b=before/p.relative_to(root); b.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(p,b)
  print(len(targets),'files backed up')
else:
  changed=[]
  for b in (x for x in before.rglob('*') if x.is_file()):
    rel=b.relative_to(before); p=root/rel
    if p.exists() and p.read_bytes()==b.read_bytes(): continue
    a=after/rel
    if p.exists(): a.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(p,a)
    changed.append({'originalPath':str(rel),'beforeSha256':hashlib.sha256(b.read_bytes()).hexdigest(),
      'newArtifactPath':str(a.relative_to(root)) if p.exists() else None,'deletedDuringRun':not p.exists(),'historicalOriginalRestored':True})
    shutil.copy2(b,p)
  (fg/f'{label}-artifact-index.json').write_text(json.dumps(changed,indent=2)+'\n'); print(len(changed),'changed; originals restored')
PY
}
s04c_fixtures() {
  protect_fixture_media before runner-final-fixtures01
  run_rc "$FG/runner-final-fixtures01.exit" python3 "$ORCH/run-runner.py" runner-final-fixtures01 "${PNPM[@]}" run test:fixtures \
    --reporter=default --reporter=json "--outputFile=$OUT/runner-final-fixtures01-vitest.json"
  protect_fixture_media after runner-final-fixtures01     # always runs, even on a red tier
  echo "fixtures wrapper exit $(cat "$FG/runner-final-fixtures01.exit") (2 = source or dist changed)"
}
s04d_freeze_dist() {
  capture "$FG/final-dist-frozen.json"
  python3 -c 'import json;d=json.load(open("'"$FG"'/final-dist-frozen.json"));print("S",d["digest"],"D_F",d["dist"]["digest"])'
}

# ---------- step 5: image + deployment tier (no tree writes) ----------
s05a_image_build() {
  run_rc "$FG/image-final01-buildstage.exit" docker build --progress=plain --target build --build-arg IMAGE_TAG="$TAG" -t "$BTAG" studio-runner/ >"$FG/image-final01-buildstage.log" 2>&1
  run_rc "$FG/image-final01-build.exit" docker build --progress=plain --build-arg IMAGE_TAG="$TAG" -t "$TAG" studio-runner/ >"$FG/image-final01-build.log" 2>&1
  docker image inspect "$TAG" "$BTAG" >"$FG/image-final01-inspect.json"
  grep -c ' CACHED' "$FG/image-final01-build.log" || true
}
s05b_dist_parity() {
  local img
  for img in "$BTAG" "$TAG"; do
    echo "$img $(docker run --rm --entrypoint sh "$img" -c 'cd /app/dist && find . -type f | LC_ALL=C sort | xargs sha256sum | sha256sum')"
  done | tee "$FG/image-final01-dist-parity.txt"
}
s05c_pins_in_image() {   # EXPECTED RED: node v24 in public base vs .nvmrc 22 (O-2a / ED-05)
  run_rc "$FG/image-final01-check-pins.exit" docker run --rm --entrypoint node "$BTAG" scripts/check-pins.mjs --require-image --json \
    >"$FG/image-final01-check-pins.json" 2>"$FG/image-final01-check-pins.stderr"
  docker run --rm --entrypoint cat "$TAG" /app/dist/runtime-versions.json >"$FG/image-final01-runtime-versions.json"
  echo "in-image check:pins exit $(cat "$FG/image-final01-check-pins.exit")"
}
s05d_deployment() {
  STUDIO_RUNNER_IMAGE="$TAG" python3 "$ORCH/run-runner.py" runner-final-deployment01 "${PNPM[@]}" run test:deployment \
    --reporter=default --reporter=json "--outputFile=$OUT/runner-final-deployment01-vitest.json"
}

# ---------- step 6: backend final check (background; ~75-110 min) ----------
s06a_archive_prior_outputs() {
  local dirs=() d
  for d in build/reports build/test-results build/jacoco build/guided-cohorts build/guard-tally; do
    if [[ -e backend/$d ]]; then dirs+=("$d"); fi
  done
  tar czf "$FG/prior-backend-build-outputs-final01.tgz" -C backend "${dirs[@]}"
  if ls /tmp/studio-obs005-*.json >/dev/null 2>&1; then
    tar czf "$FG/prior-planning-metrics-final01.tgz" -C /tmp $(cd /tmp && ls studio-obs005-*.json)
  fi
  shasum -a 256 "$FG"/prior-*-final01.tgz >"$FG/prior-outputs-final01.sha256"
}
s06b_backend_final_check() {
  [[ -f "$SKIPS_REL" ]] || { echo "missing Quinn-approved $SKIPS_REL" >&2; exit 1; }
  python3 "$ORCH/run-backend-tasked.py" backend-final-check-attempt01 \
    --test-tasks test,guidedIncrementalTest,crossReplicaTest \
    --require-exec-tasks test,guidedIncrementalTest \
    --allowed-skips-file "$SKIPS_REL" \
    -- --no-daemon --continue check --rerun-tasks \
    >"$FG/backend-final-check-attempt01.collector.log" 2>&1
}
s06c_post_check() {
  local R="$FG/backend-final-check-attempt01-reports"; mkdir -p "$R"
  for d in jacoco checkstyle spotbugs; do
    if [[ -d backend/build/reports/$d ]]; then cp -R "backend/build/reports/$d" "$R/"; fi
  done
  python3 - backend/build/reports/jacoco/test/jacocoTestReport.xml "$R/jacoco-line-summary.json" <<'PY'
import json,sys,xml.etree.ElementTree as ET
root=ET.parse(sys.argv[1]).getroot()
def line(e):
  c=next((x for x in e.findall('counter') if x.get('type')=='LINE'),None)
  if c is None: return None
  m,cv=int(c.get('missed')),int(c.get('covered')); return {'covered':cv,'missed':m,'ratio':round(cv/(cv+m),4) if cv+m else None}
pk={p.get('name').replace('/','.'):line(p) for p in root.findall('package')}
want={'bundle':0.70,'com.citi.put.checks.studio.dispatch':0.75,'com.citi.put.checks.studio.internal':0.75,
      'com.citi.put.checks.studio.recovery':0.75,'com.citi.put.checks.studio.sse':0.75,
      'com.citi.put.checks.studio.compile':0.80,'com.citi.put.checks.studio.compile.gateway':0.80}
res={k:{'minimum':v,'actual':(line(root) if k=='bundle' else pk.get(k)),'vacuous':(k!='bundle' and k not in pk)} for k,v in want.items()}
json.dump(res,open(sys.argv[2],'w'),indent=2); print(json.dumps(res))
PY
  ps -axo pid,ppid,lstart,command | grep -E 'obs007-joined|guidedMain|studio-runner/dist|GradleWorkerMain' | grep -v grep >"$FG/backend-final-check-attempt01-process-after.txt" || true
  docker ps -a --format '{{.ID}} {{.Image}} {{.Status}} {{.CreatedAt}}' >"$FG/backend-final-check-attempt01-docker-after.txt"
  echo "Clean up only owned processes with proved identity; never inherited PIDs."
}
s06d_restore_prior_outputs() {   # invariant 4; root decides for the final (fresh outputs already archived by the collector)
  shasum -a 256 -c "$FG/prior-outputs-final01.sha256"
  tar xzf "$FG/prior-backend-build-outputs-final01.tgz" -C backend
  if [[ -f "$FG/prior-planning-metrics-final01.tgz" ]]; then tar xzf "$FG/prior-planning-metrics-final01.tgz" -C /tmp; fi
}

# ---------- step 7: bind every receipt to S_F / D_F ----------
s07_bind() {
  python3 - "$ROOT" "$OUT" "$FG" <<'PY'
import hashlib,json,sys
from pathlib import Path
root,out,fg=(Path(x) for x in sys.argv[1:4])
S=json.load(open(fg/'final-source-frozen.json'))['digest']; D=json.load(open(fg/'final-dist-frozen.json'))['dist']['digest']
wrapped=['final-skipdisc01','final-sql55-attempt01','runner-final-typecheck01','runner-final-lint01','runner-final-unit01',
         'runner-final-pins01','runner-final-fixtures01','runner-final-deployment01','backend-final-check-attempt01']
manual=['contracts-final01','runner-final-build01']
rows=[]
for label,base in [(l,out) for l in wrapped]+[(l,fg) for l in manual]:
  b,a=base/f'{label}-before.json',base/f'{label}-after.json'
  if not (b.exists() and a.exists()): rows.append({'label':label,'status':'MISSING'}); continue
  jb,ja=json.load(open(b)),json.load(open(a))
  res=out/f'{label}-results.json'
  rows.append({'label':label,'sourceBefore':jb['digest'],'sourceAfter':ja['digest'],'sourceIsS_F':jb['digest']==S==ja['digest'],
    'distAfter':ja.get('dist',{}).get('digest'),'distIsD_F':ja.get('dist',{}).get('digest')==D,
    'results':str(res.relative_to(root)) if res.exists() else None,
    'resultsSha256':hashlib.sha256(res.read_bytes()).hexdigest() if res.exists() else None,
    'exit':json.load(open(res)).get('exit') if res.exists() else None})
idx={'S_F':S,'D_F':D,'receipts':rows,'note':'verdicts per gate (GREEN/RED/NOT_GREEN_EXTERNAL) are assigned by QA, not by this index'}
(fg/'final-gates-index.json').write_text(json.dumps(idx,indent=2)+'\n'); print(json.dumps(idx,indent=1)[:4000])
PY
}

# ---------- dispatch ----------
if [[ "${FINAL_GATES_RUNBOOK_ARMED:-}" != "yes" ]]; then
  echo "Reference script. Root must release the window, then: FINAL_GATES_RUNBOOK_ARMED=yes bash $0 <step_function> [args]" >&2
  exit 64
fi
[[ $# -ge 1 ]] || { echo "usage: $0 <step_function> [args]" >&2; exit 64; }
"$@"
