#!/bin/bash
# T0-DEV item 3: lanes.json v1 t0.reverifyCommands, re-run read-only at S_011.
# Tools used: grep, sed, cat, ls, wc, awk, shasum, python3 -I, and `git --no-optional-locks ls-files` (no index write).
# No gradle, node, vitest, helm, docker. Output goes to stdout only; the caller redirects it into this folder.
cd /Users/brunobuger/orca/workspaces/put-checks/ui-studio || exit 2
S=backend/src/main/java/com/citi/put/checks/studio

echo "##### 01 ls (retired frontend paths + authoring dir)"
ls frontend/src/components/studio/review frontend/src/components/studio/inference frontend/src/types/studio/legacyTestIr.ts frontend/src/components/studio/runs/index.ts frontend/src/services/mocks/studio/index.ts frontend/src/features/studio/authoring 2>&1

echo "##### 02 grep PinnedStoppedRunRecordingFacts frontend/src"
grep -rn PinnedStoppedRunRecordingFacts frontend/src

echo "##### 03 retireLegacyStudioWorker in index.tsx/main.tsx"
grep -n retireLegacyStudioWorker frontend/src/index.tsx frontend/src/main.tsx 2>&1

echo "##### 04 compile-review / ChecksStudioPage/confirm in WCAG audit test"
grep -n "compile-review\|ChecksStudioPage/confirm" frontend/src/test/a11y/studioWcagAudit.test.tsx

echo "##### 05 validate-variables in openapi + StudioController"
grep -n validate-variables docs/specs/studio/openapi.yaml $S/StudioController.java

echo "##### 06 CLN-19/20/21 symbol words in backend/src (-w)"
grep -rnw 'isCanonical\|updateAuthoring\|allocationIds\|isApiAssigned\|providerName\|getSecretName\|pollIntervalOrDefault\|readIntervalOrDefault\|recordEvidence' backend/src

echo "##### 07 read-interval in application.yml"
grep -n 'read-interval' backend/src/main/resources/application.yml

echo "##### 08 account-era symbol sweep (per symbol: file:count)"
for s in observedAccount installCookies addCookies AccountAccess AWAITING_AUTH AUTH_CONNECTION_REQUIRED accountHandle accountAuthorization accountGrantId accountAbi accountRef authConnection ACCOUNT_UNAVAILABLE ACCOUNT_UNKNOWN; do
  echo "--- $s"
  grep -rn --exclude-dir=node_modules --exclude-dir=dist "$s" frontend/src studio-runner/src backend/src/main tools docs/specs/studio-observed-authoring/contracts 2>/dev/null | cut -c1-200
done

echo "##### 09 it.skip count in deferred.test.ts"
grep -c 'it.skip' studio-runner/test/deferred.test.ts

echo "##### 10 versions.ts + TOTAL_TIMEOUT_MESSAGE"
cat studio-runner/src/versions.ts
grep -rn TOTAL_TIMEOUT_MESSAGE studio-runner/src studio-runner/test

echo "##### 11 OBSERVED_SCHEDULE_AUTH_REQUIRED in backend/src/main"
grep -rn OBSERVED_SCHEDULE_AUTH_REQUIRED backend/src/main

echo "##### 12 translation != null in GuidedSessionService"
grep -n 'translation != null' $S/guided/session/GuidedSessionService.java

echo "##### 13 instanceof GuidedProductionSessionAccess arms"
grep -n 'instanceof' -A2 $S/guided/session/GuidedSessionService.java | grep GuidedProductionSessionAccess

echo "##### 14 @Test counts GuidedSessionIT / GuidedServiceTransportFaultIT"
grep -c '@Test' backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedSessionIT.java backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedServiceTransportFaultIT.java

echo "##### 15 HistoricalV18 / requireV18 by file"
grep -rn 'HistoricalV18\|requireV18' backend/src | cut -d: -f1 | sort | uniq -c

echo "##### 16 Clock.systemUTC / clock.instant in publication trio"
grep -n 'Clock.systemUTC\|clock.instant' $S/guided/publication/GuidedPublicationAuthorization.java $S/guided/publication/GuidedPublicationConfiguration.java $S/guided/publication/GuidedPlanPublisher.java

echo "##### 17 teardown executor markers"
grep -n 'DiscardPolicy\|ArrayBlockingQueue<>(64)\|TEARDOWNS_IN_FLIGHT.add' $S/guided/session/GuidedSessionService.java

echo "##### 18 runner.validate() in backend/src/main"
grep -rn 'runner.validate()' backend/src/main

echo "##### 19 prepareScheduled"
grep -n prepareScheduled $S/guided/publication/ObservedReplayAuthorization.java $S/dispatch/StudioAcceptanceService.java

echo "##### 20 studio-runner README headings + runbook lines 13 and 132"
grep -n '^## Bounds\|^## Accepted language\|^## Fixture corpora\|validateArtifact' studio-runner/README.md
sed -n '13p;132p' docs/runbooks/studio-runner.md | cut -c1-300

echo "##### 21 shasum guidedNarratives.ts handlers.ts StudioSecretsService.java"
shasum -a 256 frontend/src/components/studio/guided/guidedNarratives.ts frontend/src/services/mocks/studio/handlers.ts $S/secrets/StudioSecretsService.java

echo "##### 22 MSW lines in frontend/README.md, CLAUDE.md, AGENTS.md, ARCH.md"
grep -n 'ALLOW_INSECURE_MSW' frontend/README.md
grep -n 'Mock-First\|control MSW enablement' CLAUDE.md AGENTS.md
grep -n 'Browser-intercepted\|Mock-first development using MSW\|MSW intercepts outgoing' ARCH.md

echo "##### 23 studioAuthoringV2 in rollout runbook"
grep -n studioAuthoringV2 docs/runbooks/studio-inference-rollout.md

echo "##### 24 .ai tracked / dirty counts"
git --no-optional-locks ls-files .ai | wc -l
echo "dirty .ai entries in t0/start-status.txt (start of B1):"
grep -c ' \.ai/' docs/qa/evidence/STUDIO-OBS-011/t0/start-status.txt

echo "##### 25 studio.compile in backend/build.gradle.kts"
grep -n 'studio.compile' backend/build.gradle.kts

echo "##### 26 ls guided/account and frontend agent-memory"
ls -la backend/src/main/java/com/citi/put/checks/studio/guided/account frontend/src/.claude/agent-memory/* 2>&1

echo "##### 27 longest line per runner guided file"
for f in studio-runner/src/guided/*.ts studio-runner/src/run/guidedBrowser.ts; do
  awk -v f="$f" 'length($0)>m{m=length($0)} END{print f, m}' "$f"
done
echo "##### 28 (brace-count script from proposal 2.3 is run separately by item3_bracecount.py)"
