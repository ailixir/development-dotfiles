#!/usr/bin/env bash
# Runs `helm template` / `helm lint` against the SANDBOX chart only and records one log per case.
# Usage: run-cases.sh <sandbox-root> <out-dir>
set -u
SB="$1"; OUT="$2"
cd "$SB" || exit 2
C=helm-chart/put-checks
PIN=$(cat baseline/pin.txt)            # the same syntactically valid TEST pin the deployment harness uses
CAT=samples/observed-catalog.TEST-ONLY.yaml
POL=samples/observed-policies.uat.TEST-ONLY.yaml
N=samples/negative
mkdir -p "$OUT"
: > "$OUT/SUMMARY.txt"
printf '%-52s %-9s %-6s %s\n' CASE EXPECTED ACTUAL FIRST-ERROR-LINE >> "$OUT/SUMMARY.txt"

# run <name> <expect: ok|fail> <keep-rendered: yes|no> -- <helm args...>
run() {
  local name="$1" expect="$2" keep="$3"; shift 4
  local log="$OUT/$name.log" rendered="$OUT/$name.rendered.yaml" tmp
  tmp=$(mktemp)
  helm "$@" > "$tmp" 2> "$OUT/.err"
  local rc=$?
  {
    echo "# case: $name"
    echo "# helm version: $(helm version --short)"
    echo "# cwd: <sandbox root> (mirrors the repo root: helm-chart/put-checks)"
    echo "# command: helm $*"
    echo "# expected: $expect"
    echo "# exit: $rc"
    echo "# --- stderr ---"
    cat "$OUT/.err"
  } > "$log"
  local actual=ok; [ $rc -ne 0 ] && actual=fail
  if [ "$keep" = yes ] && [ $rc -eq 0 ]; then
    cp "$tmp" "$rendered"
    echo "# rendered manifest: $name.rendered.yaml ($(wc -l < "$rendered" | tr -d ' ') lines)" >> "$log"
  fi
  rm -f "$tmp"
  local first; first=$(grep -m1 '^Error' "$OUT/.err" | cut -c1-170)
  local verdict=""; [ "$actual" != "$expect" ] && verdict="   <== UNEXPECTED"
  printf '%-52s %-9s %-6s %s%s\n' "$name" "$expect" "$actual" "$first" "$verdict" >> "$OUT/SUMMARY.txt"
}

UATV="-f $C/values-uat.yaml"
PINSET="--set studioRunner.tls.controllerCertificateFingerprint256=$PIN"

# ---------------------------------------------------------------- lint
for l in default uat; do
  {
    if [ $l = default ]; then
      echo "# command: helm lint $C $PINSET"
      helm lint $C $PINSET
    else
      echo "# command: helm lint $C $UATV -f $CAT -f $POL $PINSET"
      helm lint $C $UATV -f $CAT -f $POL $PINSET
    fi
    echo "# exit: $?"
  } > "$OUT/lint-$l.log" 2>&1
done

# ---------------------------------------------------------------- positive
run default                         ok  yes -- template release-name $C
run default-runner-enabled          ok  yes -- template release-name $C --set studioRunner.enabled=true $PINSET
run dev                             ok  yes -- template release-name $C -f $C/values-dev.yaml
run prod                            ok  yes -- template release-name $C -f $C/values-prod.yaml
run uat-observed                    ok  yes -- template release-name $C $UATV -f $CAT -f $POL $PINSET
run uat-validation-only             ok  yes -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set studioObserved.replayEnabled=false
run uat-replay-only                 ok  yes -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set studioObserved.validationEnabled=false
run uat-observed-flags-off          ok  yes -- template release-name $C $UATV $PINSET --set studioObserved.validationEnabled=false --set studioObserved.replayEnabled=false
run uat-image-tag-ignored           ok  yes -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set studioRunner.image.tag=9.9.9
run uat-additional-backend-catalog  ok  yes -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set-string 'studioObserved.additionalBackendCatalog[0].profile.placeholder=TEST-ONLY older profile' --set-string 'studioObserved.additionalBackendCatalog[0].build.profileHash=5555555555555555555555555555555555555555555555555555555555555555' --set-string 'studioObserved.additionalBackendCatalog[0].build.schemaBundleHash=6666666666666666666666666666666666666666666666666666666666666666' --set-string 'studioObserved.additionalBackendCatalog[0].build.referenceBundleHash=7777777777777777777777777777777777777777777777777777777777777777' --set-string 'studioObserved.additionalBackendCatalog[0].build.executableImageDigest=8888888888888888888888888888888888888888888888888888888888888888' --set-string 'studioObserved.additionalBackendCatalog[0].build.chromiumBuild=TEST-ONLY-chromium-older'
run default-observed-on-not-uat     ok  yes -- template release-name $C -f $CAT -f $POL --set studioRunner.enabled=true $PINSET --set studioObserved.validationEnabled=true --set studioObserved.replayEnabled=true
run policies-16-boundary            ok  no  -- template release-name $C $UATV -f $CAT -f $N/policies-16.yaml $PINSET
run flags-off-overrides-allowed     ok  no  -- template release-name $C --set studioRunner.enabled=true $PINSET --set-string 'backend.configOverrides.studio\.observed-replay\.catalog-json=[]' --set-string 'worker.env.STUDIO_OBSERVED_POLICIES_JSON=[]'

# ---------------------------------------------------------------- the deploy-time inputs UAT needs (intended failures)
run uat-no-catalog-no-policies      fail no -- template release-name $C $UATV $PINSET
run uat-catalog-but-no-policies     fail no -- template release-name $C $UATV -f $CAT $PINSET
run uat-no-pin-but-observed-inputs  fail no -- template release-name $C $UATV -f $CAT -f $POL

# ---------------------------------------------------------------- guards
run guard-O0-string-flag-false      fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set-string studioObserved.replayEnabled=false
run guard-O1-both-runner-off        fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set studioRunner.enabled=false
run guard-O1-validation-only        fail no -- template release-name $C -f $CAT -f $POL --set studioObserved.validationEnabled=true
run guard-O1-replay-only            fail no -- template release-name $C -f $CAT -f $POL --set studioObserved.replayEnabled=true
run guard-O2-catalog-missing        fail no -- template release-name $C $UATV $PINSET -f $POL
run guard-O2-catalog-extra-key      fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set-string studioObserved.catalog.extra=1
run guard-O2-catalog-no-profile     fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set studioObserved.catalog.profile=null
run guard-O2-profile-not-a-map      fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set-string studioObserved.catalog.profile=text
run guard-O2-build-missing-key      fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set studioObserved.catalog.build.chromiumBuild=null
run guard-O2-build-extra-key        fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set-string studioObserved.catalog.build.extra=1
run guard-O2-digest-sha256-prefix   fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set-string studioObserved.catalog.build.executableImageDigest=sha256:4444444444444444444444444444444444444444444444444444444444444444
run guard-O2-digest-uppercase       fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set-string studioObserved.catalog.build.executableImageDigest=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
run guard-O2-hash-too-short         fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set-string studioObserved.catalog.build.schemaBundleHash=abc123
run guard-O2-hash-unquoted-number   fail no -- template release-name $C $UATV -f $CAT -f $POL -f $N/catalog-numeric-hash.yaml $PINSET
run guard-O2-chromium-empty         fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set-string studioObserved.catalog.build.chromiumBuild=
run guard-O2-additional-bad-entry   fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set-string 'studioObserved.additionalBackendCatalog[0].x=1'
run guard-O3-policies-empty         fail no -- template release-name $C $UATV -f $CAT -f $N/policies-empty.yaml $PINSET
run guard-O3-policies-17            fail no -- template release-name $C $UATV -f $CAT -f $N/policies-17.yaml $PINSET
run guard-O3-policies-oversize      fail no -- template release-name $C $UATV -f $CAT -f $N/policies-oversize.yaml $PINSET
run guard-O4-backend-configOverrides-catalog   fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set-string 'backend.configOverrides.studio\.observed-replay\.catalog-json=[]'
run guard-O4-worker-configOverrides-policies   fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set-string 'worker.configOverrides.studio\.observed-replay\.policies-json=[]'
run guard-O4-backend-env-catalog    fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set-string backend.env.STUDIO_OBSERVED_CATALOG_JSON='[]'
run guard-O4-worker-env-policies    fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set-string worker.env.STUDIO_OBSERVED_POLICIES_JSON='[]'
run guard-O4-nested-relaxed-backend fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET -f $N/overrides-nested-relaxed.yaml
run guard-O4-nested-camel-worker    fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET -f $N/overrides-worker-nested.yaml

# ---------------------------------------------------------------- runnerEnv cannot set the managed keys
for k in VALIDATION_ENABLED REPLAY_ENABLED CATALOG_FILE POLICY_FILE IMAGE_DIGEST FUTURE_KEY; do
  run "runnerEnv-OBSERVED_$k" fail no -- template release-name $C $UATV -f $CAT -f $POL $PINSET --set-string studioRunner.runnerEnv.STUDIO_RUNNER_OBSERVED_$k=x
done

rm -f "$OUT/.err"
cat "$OUT/SUMMARY.txt"
