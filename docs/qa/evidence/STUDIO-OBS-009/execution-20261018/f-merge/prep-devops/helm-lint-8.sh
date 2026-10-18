#!/usr/bin/env bash
# helm lint over the four value sets x guided off/on, with the controller pin set.
# Lint-only fixture inputs; none of these values is a deployment value.
set -u
CHART=helm-chart/put-checks
PIN='0B:12:19:20:27:2E:35:3C:43:4A:51:58:5F:66:6D:74:7B:82:89:90:97:9E:A5:AC:B3:BA:C1:C8:CF:D6:DD:E4'
fail=0
for values in "" values-dev.yaml values-uat.yaml values-prod.yaml; do
  for guided in off on; do
    args=(--set studioRunner.enabled=true --set-string "studioRunner.tls.controllerCertificateFingerprint256=${PIN}")
    [ -n "$values" ] && args=(-f "$CHART/$values" "${args[@]}")
    if [ "$guided" = on ]; then
      args+=(--set studioRunner.guided.enabled=true --set studioRunner.replicaCount=1
             --set-string studioRunner.guided.token.issuer=https://guided-issuer.example.test
             --set-string studioRunner.guided.token.controllerSubject=checks-backend-controller
             --set-string studioRunner.guided.token.publicKey=lint-fixture-public-key)
    fi
    out=$(helm lint "$CHART" "${args[@]}" 2>&1); rc=$?
    echo "values=${values:-values.yaml} guided=$guided rc=$rc :: $(echo "$out" | tail -1)"
    [ $rc -ne 0 ] && { fail=1; echo "$out" | sed 's/^/    /'; }
  done
done
# Control (helm 4.2.0): without the pin `helm template` fails (exit 1) and `helm lint` still exits 0
# but prints a "missing required values" WARN naming the key. Both are checked, so a pin that is
# dropped from the stage is noticed by either.
lintout=$(helm lint "$CHART" --set studioRunner.enabled=true 2>&1); lintrc=$?
tplout=$(helm template "$CHART" --set studioRunner.enabled=true 2>&1 >/dev/null); tplrc=$?
echo "control no-pin: lint rc=$lintrc warns=$(echo "$lintout" | grep -c 'controllerCertificateFingerprint256') ; template rc=$tplrc names-key=$(echo "$tplout" | grep -c 'controllerCertificateFingerprint256')"
[ "$tplrc" -ne 0 ] || fail=1
echo "$lintout" | grep -q controllerCertificateFingerprint256 || fail=1
exit $fail
