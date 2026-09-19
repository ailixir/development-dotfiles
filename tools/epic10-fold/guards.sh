#!/usr/bin/env bash
# Semantic guards for a merged tree. Run against the worktree that holds the merge result BEFORE
# committing it. Each guard is a claim that was verified false on one side of the merge on
# 2026-09-18 (see RULINGS.md); a green run means the merge kept the ruling, nothing more.
#   usage: guards.sh <tree-root>
set -euo pipefail
T="${1:?tree root}"; fail=0
g() { if eval "$2"; then echo "ok    $1"; else echo "FAIL  $1"; fail=1; fi; }

SVC="$T/backend/src/main/java/com/citi/put/checks/studio/StudioService.java"
CTL="$T/backend/src/main/java/com/citi/put/checks/studio/StudioController.java"
TPL="$T/helm-chart/put-checks/templates/_helpers.tpl"
CFG="$T/studio-runner/src/server/config.ts"
RB="$T/docs/runbooks/studio-runner.md"
CONTRACT="$T/docs/specs/studio/openapi.yaml"; PIN="$T/studio-runner/test/run/confinement.test.ts"

echo "== StudioService.java (story 10.30, ADR-002 §27.2)"
g "no call to the removed requireCompile (their side's name; ours renamed it requireWrite)" \
  "! grep -q 'requireCompile(' '$SVC'"
g "requireWrite is defined" "grep -q 'private void requireWrite(Authentication auth, String csiId)' '$SVC'"
g "authorized delete overload exists: softDeleteTest(UUID id, Authentication auth)" \
  "grep -q 'public void softDeleteTest(UUID id, Authentication auth)' '$SVC'"
g "createTest authorizes with requireWrite(auth, request.csiId())" "grep -q 'requireWrite(auth, request.csiId())' '$SVC'"
g "updateTest's caller path reads the draft through the visibility restriction (findById -> 403)" \
  "grep -q 'UITest visible = studioRepository.findById(id).orElseThrow(StudioAccessDeniedException::new)' '$SVC'"
g "updateTest never authorizes through findCsiIdIncludingWithheld (ADR-002 §14.5)" \
  "! awk '/public UITestDto updateTest\\(/,/^  }$/' '$SVC' | grep -q 'findCsiIdIncludingWithheld'"
g "controller passes Authentication into delete" "grep -q 'studioService.softDeleteTest(id, auth)' '$CTL'"

echo "== chart accepted keys vs runner loader"
tpl_keys=$(awk '/define "put-checks.studioRunner.acceptedEnvKeys"/{getline; print}' "$TPL" | tr ' ' '\n' | sed 's/^STUDIO_RUNNER_//' | sort -u)
cfg_keys=$(grep -oE '^  [A-Z][A-Z0-9_]+: \{' "$CFG" | sed 's/: {//; s/ //g' | sort -u)
g "every chart-accepted key is a loader KEY_SPECS entry" "[ -z \"\$(comm -23 <(echo \"$tpl_keys\") <(echo \"$cfg_keys\"))\" ]"
g "loader KEY_SPECS has no duplicate entries" "[ -z \"\$(grep -oE '^  [A-Z][A-Z0-9_]+: \\{' '$CFG' | sort | uniq -d)\" ]"
n=$(echo "$cfg_keys" | wc -l | tr -d ' ')
words=(zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen)
tens=(x x twenty thirty forty fifty); w=${words[$((n%10))]}; word="${tens[$((n/10))]}-$w"; [ $((n%10)) -eq 0 ] && word="${tens[$((n/10))]}"
g "_helpers.tpl prose count matches the loader ($n keys -> '$word')" "grep -q 'the loader accepts $word keys' '$TPL'"

echo "== contract pin (ADR-002 §12; confinement.test.ts BASE_SHA256)"
actual=$(shasum -a 256 "$CONTRACT" | cut -d' ' -f1); pinned=$(grep -oE "BASE_SHA256 = '[0-9a-f]{64}'" "$PIN" | grep -oE '[0-9a-f]{64}')
g "BASE_SHA256 ($pinned) == sha256(openapi.yaml) ($actual)" "[ '$actual' = '$pinned' ]"
g "no conflict markers left in the contract" "! grep -qE '^(<<<<<<<|=======|>>>>>>>)' '$CONTRACT'"

echo "== runbook claims that their §11 rewrite makes false (only checked when their §11 is present)"
if grep -q 'SPRING_CONFIG_ADDITIONAL_LOCATION' "$RB"; then
  g "no 'never applied anything in the first place — §11' once configOverrides is delivered" "! grep -q 'never applied anything in the first place' '$RB'"
  g "no 'has never reached a process' once configOverrides is delivered" "! grep -q 'has never reached a process' '$RB'"
fi
hi=$(ls "$T/backend/src/main/resources/db/migration/" | grep -oE '^V[0-9]+' | sort -V | tail -1)
g "runbook §12 names the highest Studio migration present ($hi)" "grep -q \"through \\\`$hi\\\`\" '$RB'"

echo "== leftover conflict markers anywhere in the 17"
g "none" "! grep -rlE '^(<<<<<<<|=======|>>>>>>>)' '$T/backend/src' '$T/studio-runner/src' '$T/studio-runner/test' '$T/helm-chart' '$T/docs/runbooks' '$T/docs/architecture/ADR-002-internal-contract-surface.md' '$T/frontend/src/services/mocks/studio' 2>/dev/null | grep -q ."
exit $fail
