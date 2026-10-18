#!/bin/zsh
# STUDIO-OBS-009 G9b (root): the full local gate after the post-G9 writer batch (post-g9/receipt.md).
# Steps: one clean runner dist rebuild, then C0-C9 at one frozen digest, plus the residue image (U22, OI-1) and its C4.
# C10 is not repeated here; Quinn decides whether any mutation has to be re-run at this digest.
set -u
ROOT=/Users/brunobuger/orca/workspaces/put-checks/ui-studio
G=$ROOT/docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018b
X9=$ROOT/.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009
LOCK=$ROOT/.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py
CAP=$ROOT/.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py
N24=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin
PN="pnpm --config.package-manager-strict=false"
REPO=put-checks-studio-runner
TAG=$REPO:obs009-residue-local
BTAG=$REPO:obs009-residue-buildstage-local
mkdir -p $G; cd $ROOT
st() { echo "$1 exit=$2" | tee -a $G/status.txt; }
helm_digest() { find helm-chart -type f | sort | xargs shasum -a 256 > $1; shasum -a 256 $1 | cut -d' ' -f1; }
export PATH=$N24:$PATH
# R0: the single dist rebuild (clean first, as in F-merge)
python3 $CAP $G/pre-rebuild.json | tee $G/pre-rebuild.summary
(cd studio-runner && eval $PN run clean) > $G/r0-clean.log 2>&1; st R0-clean $?
python3 $X9/run-runner-build.py obs009-g9b-build01 > $G/r0-build.out 2>&1; st R0-build $?
python3 $LOCK zsh -c "cd backend && ./gradlew verifyRunnerDist --no-daemon" > $G/r0-verifyRunnerDist.log 2>&1; st R0-verifyRunnerDist $?
# C0
python3 $CAP $G/capture-before.json | tee $G/capture-before.summary
echo "helm-before $(helm_digest $G/helm-before.txt)" | tee -a $G/status.txt
pgrep -fl GradleDaemon > $G/c0-gradle-daemons.txt; vm_stat > $G/c0-vmstat.txt
# C1-C3 runner
(cd studio-runner && eval $PN run type-check && eval $PN run lint) > $G/c1.log 2>&1; st C1-runner-typecheck-lint $?
python3 $X9/run-runner.py obs009-g9b-runner-unit01 ./node_modules/.bin/vitest run > /dev/null 2>&1; st C2-runner-unit $?
python3 $X9/run-runner.py obs009-g9b-runner-fixtures01 pnpm --config.package-manager-strict=false exec vitest run --config vitest.fixtures.config.ts --minWorkers=1 --maxWorkers=1 > /dev/null 2>&1; st C3-runner-fixtures $?
# C4: residue image (Dockerfile gained a COPY; dist changed), then the deployment tier against it
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' > $G/docker-images-before.txt 2>&1
docker build --progress=plain --pull=false --target build --build-arg IMAGE_TAG="$TAG" -t "$BTAG" studio-runner/ > $G/c4-build-buildstage.log 2>&1; st C4-image-buildstage $?
docker build --progress=plain --pull=false --build-arg IMAGE_TAG="$TAG" -t "$TAG" studio-runner/ > $G/c4-build-final.log 2>&1; st C4-image-final $?
docker image inspect "$TAG" > $G/c4-image-inspect.json 2>&1
STUDIO_RUNNER_IMAGE=$TAG python3 $X9/run-runner.py obs009-g9b-runner-deploy01 pnpm --config.package-manager-strict=false exec vitest run --config vitest.deployment.config.ts --minWorkers=1 --maxWorkers=1 > /dev/null 2>&1; st C4-runner-deployment $?
# C5 pins, contracts, codegen
(cd studio-runner && eval $PN run check:pins) > $G/c5-pins.log 2>&1; st C5-pins $?
node tools/check-studio-observed-contracts.cjs > $G/c5-contracts.log 2>&1; st C5-contracts $?
node tools/build-studio-observed-schemas.cjs --check > $G/c5-codegen.log 2>&1; st C5-codegen $?
# C6 frontend (host node)
export PATH=$(echo $PATH | sed "s#$N24:##")
(cd frontend && pnpm run type-check && pnpm run lint && pnpm exec vitest run --minWorkers=1 --maxWorkers=3 && pnpm run build) > $G/c6-frontend.log 2>&1; st C6-frontend $?
export PATH=$N24:$PATH
# C7 greps (same as G9)
{
 echo "P2 retired names: $(grep -rnE 'ARTIFACT_VERSION|VALIDATOR_SCHEMA_VERSION|SYNTAX_REFERENCE_VERSION|VALIDATOR_PARSER|EXECUTOR_VERSION' studio-runner/src studio-runner/scripts | wc -l)"
 echo "DEFERRED STUDIO-OBS-009: $(grep -rn 'DEFERRED STUDIO-OBS-009' backend/src/test | wc -l)"
 echo "guidedMain src/dist: $(ls studio-runner/src/run/guidedMain.ts studio-runner/dist/run/guidedMain.js 2>/dev/null | wc -l)"
 echo "start:guided in package.json: $(grep -c 'start:guided' studio-runner/package.json)"
 echo "studio-guided-worker templates: $(ls helm-chart/put-checks/templates | grep -c studio-guided-worker)"
 echo "sameIdentity bodies: $(grep -rnE 'boolean sameIdentity\(' backend/src/main | wc -l)"
 echo "SSLContext.getDefault: $(grep -rn 'SSLContext.getDefault' backend/src/main | wc -l)"
} > $G/c7-greps.txt 2>&1; cat $G/c7-greps.txt
# C8 backend: full check, fresh, nothing else heavy alongside
python3 $LOCK python3 $X9/run-backend-tasked.py obs009-g9b-check01 --test-tasks test,guidedIncrementalTest,crossReplicaTest --require-exec-tasks test,guidedIncrementalTest,crossReplicaTest --allowed-skips-file docs/qa/evidence/STUDIO-OBS-009/execution-20261018/qa/approved-skips.json -- --continue check --rerun-tasks --no-daemon > $G/c8-backend.collector.log 2>&1; st C8-backend $?
rm -rf $G/c8-test-results $G/c8-jacoco; mkdir -p $G/c8-test-results
cp -R backend/build/test-results/. $G/c8-test-results/ 2>/dev/null
cp -R backend/build/reports/jacoco $G/c8-jacoco 2>/dev/null
ls -la --time-style=full-iso $G/c8-jacoco > $G/c8-jacoco-listing.txt 2>&1 || ls -laT $G/c8-jacoco > $G/c8-jacoco-listing.txt 2>&1
# C9
python3 $CAP $G/capture-after.json | tee $G/capture-after.summary
echo "helm-after $(helm_digest $G/helm-after.txt)" | tee -a $G/status.txt
echo G9B-DONE >> $G/status.txt
