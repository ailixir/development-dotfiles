# Receipt: STUDIO-OBS-009 F-merge prep, chart and CI/doc fixes (@devops)

- **Agent:** Gage (@devops). **Date:** 2026-10-18. **Mode:** YOLO. No git commit, stash or push. No docker, no cluster, no install, no dist rebuild. `dispatch-governance.js` not touched. No process signalled except one stray `cat` I started myself (see Deviations 5).
- **Legend:** [V] ran or read today; [I] inference; [U] unrun, owner named.
- **Verdict: GREEN** on the five items. Test counts were taken while other lanes edit: non-evidentiary (root R3).

## 1. Files written (sha256 after; before in `sha256-before-*.txt` or the line below)

| File | After (first 12) | Before (first 12) |
|---|---|---|
| `helm-chart/put-checks/templates/_helpers.tpl` | ecf26fc7d630 | 374fa7bf5889 (D2 final bytes) |
| `helm-chart/put-checks/templates/api-guided-tls-networkpolicy.yaml` (new) | d34344cc3a26 | none |
| `studio-runner/test/deployment/tls-client-cert.test.ts` | ec1a25c4d2ce | b1bdbb12a663 |
| `studio-runner/test/deployment/chart.test.ts` (outside the stated set, see Deviations 1) | e6b666c81b20 | 0561f37d33a0 |
| `studio-runner/ci/stages.md` | 4ca78b97f007 | 15082994d07d |
| `studio-runner/README.md` | 1b8891f98823 | c8ea6c518ce5 |
| `docs/runbooks/studio-runner.md` | 8971ca6b0f5f | 9b80b5c1538e |

Full hashes: `sha256-after.txt`, `sha256-before-tests-docs.txt`, `sha256-before-chart-test.txt`. `studio-runner/test/deployment/helm.ts`, `values*.yaml`, `deployment.yaml` and `studio-runner-service.yaml` were not edited.

## 2. What was done, by item

1. **D3 (iv) [V].** `_helpers.tpl` renders `studio.guided-authoring.connector.port` (int, from `studioRunner.guided.tlsConnector.port`). The `client-auth` line is deleted, the reserved list is `studioguidedauthoringconnectorport`, the comment is rewritten. `tls-client-cert.test.ts`: all `tls-connector` names replaced, `client-auth` assertion replaced by "exactly one `connector`-bearing property", unused `secretNames` removed, and a new case that moves the value with `--set studioRunner.guided.tlsConnector.port=9443` and checks property, container port and absence on the worker. Tripwire `grep -rn "tls-connector" helm-chart studio-runner/test/deployment` returns 0 (`logs/tripwires.log`).
2. **D3 (i) chart [V].** New `api-guided-tls-networkpolicy.yaml` `<api-fullname>-guided-tls-ingress`: `policyTypes: [Ingress]`; rule 1 = the API ordinary port (`backend.service.port`), no `from`; rule 2 = the connector port from `podSelector` runner and `podSelector` worker only. Rendered only when `guidedEnabled` AND `studioRunner.networkPolicy.enabled` (Deviations 2). 20 new test cases in `tls-client-cert.test.ts` (19 policy cases: off on 4 value sets, off with the runner disabled, off with the networkPolicy switch, selects-API-and-Ingress-only x4, rule 1 x4, rule 2 x4, port-moves-with-key; plus 1 connector-port single-source case). Rule 1 is derived from the rendered API Deployment's container ports minus `guided-tls`.
3. **D3 baton [V].** Already rendered by D2: API container port `guided-tls` (`deployment.yaml:117-120`) and Service `<fullname>-api-guided-tls` (`studio-runner-service.yaml`). No change needed; the connector-port test now also asserts them.
4. **D1/D2 F1 and CI [V].** `ci/stages.md` stage 8 now passes `--set-string studioRunner.tls.controllerCertificateFingerprint256="$PIN"` to both `helm lint` and `helm template` (the pin is the fixture `TEST_PIN` of `helm.ts`, verified equal), and says why. Retired names swept: README rows for `src/compat` and `src/versions.ts`, the two `executor 2.1.0` headings and sentence, the `SYNTAX_REFERENCE_VERSION` mentions, the Versions paragraph, upgrade steps 5-6, the Runtime compatibility section (rewritten to the fail-closed record), and the `start:guided` mention; stages.md's `runtime-versions.json` field list. Runbook: new section 14 (one entrypoint, TLS and pin, rotation, trust-store issuer rule, connector and API NetworkPolicy, one-pod guard, new Secrets and the UAT upgrade break, PID 1 and image checks owed), the section 4 `CMD` paragraph corrected to the A6 form, a header row, and a "superseded" banner on section 12(e) (it describes the retired executor pin; a grep of `backend/src/main` and `helm-chart` finds no `executor-version`). `studio-guided-authoring.md` not touched.
5. **D2 note [V].** The PKCS12 note (cert-manager `keystores.pkcs12`, password as a file, directory mount, issuer-side conversion, trust-store caveat) is in runbook section 14.2. Not put into `values.yaml` (one place).

## 3. Commands (all from `studio-runner/` with N24 unless stated; exit, counts)

| Command | Result | Log |
|---|---|---|
| deployment tier, `tls-client-cert.test.ts` alone, before the chart.test fix | exit 1 first run (1 failed: my render of guided with the runner off throws), fixed; second run exit 0, **72/72** | `logs/green-tls-client-cert-{1,2}.log` |
| deployment tier, 9 files: tls-client-cert, chart, dump-settings, envfrom-keys, backend-env, scaling, edge, integrations, cancel-budget-env (`STUDIO_RUNNER_IMAGE=put-checks-studio-runner:obs015-final07-local`) | first run exit 1, 5 failed / 572 passed: 4 `chart.test.ts` "exactly one workload" cases and the template-inventory case, both caused by the new template; fixed in `chart.test.ts`; final run exit 0, **577/577, 9 files** | `logs/green-deployment-tier.log` |
| default-tier readers: deployment-tier-wiring, disclosure, run/sandbox, run/confinement, pins | exit 0, 99 passed / 1 skipped (pre-existing) | `logs/green-default-tier-readers.log` |
| `tsc -p tsconfig.json --noEmit` | exit 0, **0 errors** (was 1: `secretNames`) | `logs/tsc-runner-final.log` |
| `eslint` on the two edited deployment tests | exit 0 | `logs/eslint-deployment-tests.log` |
| `helm lint` x 4 value sets x guided off/on, with the pin (from the repo root, `helm-lint-8.sh`) | **8/8** `0 chart(s) failed` | `logs/helm-lint-8.log` |
| the two stage-8 commands as written in `stages.md` | lint exit 0; template exit 0, 24 documents | `logs/stage8-doc-*` |
| control, no pin | `helm template` exit 1 naming `controllerCertificateFingerprint256`; `helm lint` exit 0 with a `missing required values` WARN naming the key (**Helm 4.2.0**) | `logs/helm-lint-8.log` last line |

Not run: `sec2.test.ts` (docker run), the fixtures tier, any Gradle task.

## 4. Mutations (live files, restored byte for byte, sha checked) `mutations.json`

All 8 killed by `tls-client-cert.test.ts` (72 cases each): m1 connector name reverted (5 red), m2 rule 1 deleted (5), m3 API pods added as a source (4), m4 worker source dropped (4), m5 rendered while guided off (5), m6 connector in the all-sources rule (5), m7 Egress added to `policyTypes` (4), m8 wrong connector port in rule 2 (5). Pre-mutation hashes re-verified `OK` after the run.

## 5. Deviations and decisions

1. **[AUTO-DECISION] Edited `chart.test.ts`** (outside the stated write set; it is D2's own file). Two existing AC-1 assertions fail by design once the ruled template exists: the rendered kinds named "guided" are now `ConfigMap, NetworkPolicy, Service`, and the template inventory allows exactly one file name, `api-guided-tls-networkpolicy.yaml` (any other file with "guided" in its name still fails, so a worker template cannot hide behind it). Without it the tier is red.
2. **[AUTO-DECISION] The policy also honours `studioRunner.networkPolicy.enabled`.** The ruling says to render it "only when guided is on"; I added the existing master switch as a second condition, because the runner's own policy has it and a cluster that cannot enforce policies needs one off switch. With the switch off the connector is open to every pod in the namespace, which is the same position as the runner's policy off. Root may drop the condition (one token in the template, and the matching test).
3. **[AUTO-DECISION] npm to pnpm not applied in `studio-runner/README.md` or `ci/stages.md`.** Those files contain no frontend command. Every npm line there is the runner's own (`package.json` `packageManager: npm@11.3.0`, `package-lock.json`, the Dockerfile `npm ci`), and rewriting them to pnpm would describe a path that does not exist (no pnpm lockfile in the runner).
4. **D2's earlier claim is corrected:** my D2 receipt said `helm lint` fails without the pin. On Helm 4.2.0 `helm lint` exits 0 with a WARN; only `helm template` fails. `stages.md` states both.
5. A stray `cat > /tmp/dummy` in one of my own shell commands waited on stdin; I killed that one process (pid 66332, started by me). No file was left.
6. The `d2/rotation-and-cert-inputs.md` sentence on the dedicated trust-store issuer (ruling 4(i) c) and the two PKCS12 routes (4(ii)) are in the runbook, not appended to that evidence file (outside the stated set). A one-line append is available if root wants it there.

## 6. ACs (local half) and owed externally

- Local: item 4(iv) tripwire 0, `secretNames` removed (tsc 0), API ingress policy with positive and negative render tests, F1 pin in CI, retired-name sweep, runbook for entrypoint/TLS/one-pod guard/Secrets.
- **Owed, unrun:** policy enforcement in a cluster (CNI, SPK-05; @devops G-4 / 010); image build and every Docker check in runbook 14.5; PKCS12 profile support on the JDK and cert-manager version (Platform/SRE); the pre-F-merge backend half (path filter in `GuidedSessionConfiguration`, `RunnerTlsClientCertIT` cases) belongs to root.

## 7. Findings for root

- **F1.** `studio-runner/README.md` still carries the artifact-1 engine sections (Bounds, Accepted language, Text-entry role equivalence, Visible-only resolution, Fixture corpora `fixtures/reference` and `fixtures/adversarial`, Adding a reference example, the Security model's `validateArtifact`). The engine and its fixtures are deleted (STUDIO-OBS-012A). I swept the retired **names and stamps** only, as asked, and did not delete these sections. They need a docs cleanup story (011 CLN candidate).
- **F2.** Runbook sections 1-3 and 5-13 were not re-audited (header says so). Section 2's `callback-api` row omits the guided connector port (listed in 14.6).
- **F3.** The three `values-*.yaml` Secret names are placeholders; UAT already enables the runner (D2 F4, runbook 14.4).

## 8. Batons

1. `_helpers.tpl` + `tls-client-cert.test.ts` + the backend's `studio.guided-authoring.connector.port` read (already in `GuidedSessionConfiguration`) land together; the chart alone already renders the right name.
2. `api-guided-tls-networkpolicy.yaml` + `chart.test.ts` allow-list change land together or the AC-1 inventory test goes red.
3. `ci/stages.md` pin argument with the chart (D2 baton 4), now done.
