#!/bin/zsh
# STUDIO-OBS-009 G9 (root): serialized local gate C0-C9 at one frozen source digest (+ helm supplement). C10 + the record are Quinn's.
set -u
ROOT=/Users/brunobuger/orca/workspaces/put-checks/ui-studio
G=$ROOT/docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018
X9=$ROOT/.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009
LOCK=$ROOT/.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py
CAP=$ROOT/.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py
N24=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin
PN="pnpm --config.package-manager-strict=false"
mkdir -p $G; cd $ROOT
st() { echo "$1 exit=$2" | tee -a $G/status.txt; }
helm_digest() { find helm-chart -type f | sort | xargs shasum -a 256 > $1; shasum -a 256 $1 | cut -d' ' -f1; }
# C0
export PATH=$N24:$PATH
python3 $CAP $G/capture-before.json | tee $G/capture-before.summary
echo "helm-before $(helm_digest $G/helm-before.txt)" | tee -a $G/status.txt
lsof -nP -iTCP -sTCP:LISTEN > $G/c0-listeners.txt 2>&1; ps -axo pid,ppid,command | grep checks-guided | grep -v grep > $G/c0-checks-guided.txt; pgrep -fl GradleDaemon > $G/c0-gradle-daemons.txt; vm_stat > $G/c0-vmstat.txt
# C1-C5 runner + contracts
(cd studio-runner && eval $PN run type-check && eval $PN run lint) > $G/c1.log 2>&1; st C1-runner-typecheck-lint $?
python3 $X9/run-runner.py obs009-g9-runner-unit01 ./node_modules/.bin/vitest run > /dev/null 2>&1; st C2-runner-unit $?
python3 $X9/run-runner.py obs009-g9-runner-fixtures01 pnpm --config.package-manager-strict=false exec vitest run --config vitest.fixtures.config.ts --minWorkers=1 --maxWorkers=1 > /dev/null 2>&1; st C3-runner-fixtures $?
python3 $X9/run-runner.py obs009-g9-runner-deploy01 pnpm --config.package-manager-strict=false exec vitest run --config vitest.deployment.config.ts --minWorkers=1 --maxWorkers=1 > /dev/null 2>&1; st C4-runner-deployment $?
(cd studio-runner && eval $PN run check:pins) > $G/c5-pins.log 2>&1; st C5-pins $?
node tools/check-studio-observed-contracts.cjs > $G/c5-contracts.log 2>&1; st C5-contracts $?
node tools/build-studio-observed-schemas.cjs --check > $G/c5-codegen.log 2>&1; st C5-codegen $?
# C6 frontend (host node)
export PATH=$(echo $PATH | sed "s#$N24:##")
(cd frontend && pnpm run type-check && pnpm run lint && pnpm exec vitest run --minWorkers=1 --maxWorkers=3 && pnpm run build) > $G/c6-frontend.log 2>&1; st C6-frontend $?
export PATH=$N24:$PATH
# C7 greps
{
 echo "P2 retired names: $(grep -rnE 'ARTIFACT_VERSION|VALIDATOR_SCHEMA_VERSION|SYNTAX_REFERENCE_VERSION|VALIDATOR_PARSER|EXECUTOR_VERSION' studio-runner/src studio-runner/scripts | wc -l)"
 echo "DEFERRED STUDIO-OBS-009: $(grep -rn 'DEFERRED STUDIO-OBS-009' backend/src/test | wc -l)"
 echo "guidedMain src/dist: $(ls studio-runner/src/run/guidedMain.ts studio-runner/dist/run/guidedMain.js 2>/dev/null | wc -l)"
 echo "start:guided in package.json: $(grep -c 'start:guided' studio-runner/package.json)"
 echo "studio-guided-worker templates: $(ls helm-chart/put-checks/templates | grep -c studio-guided-worker)"
 echo "sameIdentity bodies: $(grep -rnE 'boolean sameIdentity\(' backend/src/main | wc -l)"
 echo "SSLContext.getDefault: $(grep -rn 'SSLContext.getDefault' backend/src/main | wc -l)"
 python3 - <<'EOF'
import re,pathlib
n=0
for p in pathlib.Path('backend/src/test').rglob('*.java'):
    n+=len(re.findall(r'@Disabled\b',p.read_text()))
print('@Disabled (parsed):',n)
EOF
} > $G/c7-greps.txt 2>&1; cat $G/c7-greps.txt
# C8 backend
python3 $LOCK python3 $X9/run-backend-tasked.py obs009-g9-check01 --test-tasks test,guidedIncrementalTest,crossReplicaTest --require-exec-tasks test,guidedIncrementalTest,crossReplicaTest --allowed-skips-file docs/qa/evidence/STUDIO-OBS-009/execution-20261018/qa/approved-skips.json -- --continue check --rerun-tasks --no-daemon > $G/c8-backend.collector.log 2>&1; st C8-backend $?
mkdir -p $G/c8-test-results; cp -R backend/build/test-results/. $G/c8-test-results/ 2>/dev/null; cp -R backend/build/reports/jacoco $G/c8-jacoco 2>/dev/null
# C9
python3 $CAP $G/capture-after.json | tee $G/capture-after.summary
echo "helm-after $(helm_digest $G/helm-after.txt)" | tee -a $G/status.txt
echo G9-DONE >> $G/status.txt
