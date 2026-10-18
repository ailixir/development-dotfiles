# Receipt: lane D1.0 (runner launch contract, interface drop)

- **Agent:** Dex (@dev, runner). **Date:** 2026-10-18. **Mode:** YOLO, no questions asked.
- **Deliverable:** `launch-contract.md` in this directory (sha256 in the last section). Status DRAFT FOR REVIEW: @architect review against rulings A2 and A3, and @devops (Gage) co-sign, are both still owed (`lanes.json` → `w0Refold20261017` → D1.0 verify). Nothing here is binding yet.
- **Exit criterion** ("keys, file-path keys, guided enable switch, probe over TLS, readiness signal, exit codes named"), where each is:

| Exit item | Section of `launch-contract.md` |
|---|---|
| config keys (4 listener, 8 guided; 45 today, 57 after) | 2.2 to 2.4 |
| file-path keys (`TLS_KEY_FILE`, `TLS_CERT_FILE`, `TLS_CA_FILE`, `GUIDED_CONTROLLER_PUBLIC_KEY_FILE`, `GUIDED_CALLBACK_TOKEN_FILE`, plus directory `GUIDED_JOURNAL_DIR`) | 2.3, 2.4 |
| guided enable switch (`STUDIO_RUNNER_GUIDED_ENABLED`, default false; guided keys refused when off) | 1.4, 2.4 |
| probe over TLS (`probe.ts`, runner's own certificate, fingerprint pin, Helm command unchanged) | 5 |
| readiness signal (`/ready`, `/health`, one drain flag, listening-last) | 7 |
| exit codes (0, 1, 69, 78; 78 for the new guided refusals, proposed) | 3, 6 |
| PID-1 behaviour | 8 |
| open questions for @architect (Q1 to Q10) and co-sign request for @devops | 10, 11 |

## What I did

- Read the T0 ruling (A2, A3, A4, A6, §4 PID-1), the story (AC-1, AC-3, A2.6, PID-1, KL-015-D5), the W0 decisions, `lanes.json` D1.0 and PR-RT entries and the 010 skeleton `CHANGES-IN-009` rows (RKS-00, RKO-01 to RKO-04, CHT-01 to CHT-09).
- Read the runner source named in the contract header, the Dockerfile, `package.json`, the chart deployment, helpers and values, and the backend classes `GuidedTranslationProperties` and `GuidedInternalSecurity` (to name what the backend must match).
- Ran four `node` start-ups of the existing `dist` that fail before binding, to read exit codes and stderr: `node dist/main.js` with an empty runner environment (exit 78, three `configuration rejected:` lines), with an unknown key (exit 78); `node dist/run/guidedMain.js` with no config (exit 1, `GUIDED_WORKER_UNAVAILABLE`), and with `NODE_OPTIONS` set (exit 1, same line). One `node -e` import of `dist/server/config.js` (`ACCEPTED_KEYS` = 45). One `openssl x509 -dates` on the test fixture certificate (valid to 2036).
- Changed no source, chart, Dockerfile, story, lock or dist file.

## Findings that change what D2, D3 and F code against

1. **TLS keys and the controller fingerprint cannot be guided keys.** A3 (no plaintext in any configuration, all routes pin the controller) and A2.2 (guided keys refused when guided is off) together force them to be listener keys that every deployment supplies. The contract names them `TLS_*` and `CONTROLLER_CERTIFICATE_FINGERPRINT256` (proposed).
2. **The ruling says a failed launch-tree guard "writes `CONFIGURATION_DENIED`"; today it never does.** `guidedMain.ts:42` swallows the throw and prints `GUIDED_WORKER_UNAVAILABLE`, exit 1 (run C and D above). The contract proposes exit 78 with a `CONFIGURATION_DENIED <reason>` line (Q2).
3. **Guided scratch is not under `SCRATCH_DIR`.** It lives under `TMPDIR` (`browser.ts:544`, `recordingScratch.ts:56`), and the runner pod is `readOnlyRootFilesystem: true` with no `TMPDIR` and no `/tmp` mount. A guided-enabled pod cannot launch a browser until D2 fixes that (Q4).
4. **`GUIDED_CALLBACK_TOKEN_FILE` has no owner.** The backend accepts worker tokens only as RS256 JWTs of at most 300 s lifetime (`GuidedInternalSecurity.java:201-210`); a Kubernetes Secret is static; the pod must stay single-container (Q6). This blocks any guided-enabled shared environment.
5. **`NODE_OPTIONS` must never be set** on a guided-enabled process (refused at startup, per request and per launch).
6. **The journal directory must not be under `SCRATCH_DIR`** (wiped at every start, `application.ts:174`) (Q3).
7. **The probe cannot verify the runner's host name** (`127.0.0.1` need not be in its SANs), so it pins the server certificate to its own certificate's fingerprint (proposed).
8. **Cost of the fold for lane F:** four newly required listener keys break every `loadConfig` unit test that passes a minimal environment unless they are required by the listener and `main`, not by `loadConfig` (Q8).

## Not done, and why

- No @architect review and no @devops co-sign: they are other agents' gates.
- Nothing in the contract is verified by a running listener (none was bound). The bind-failure exit code (1) is an inference from `main.ts:156`.
- The key names other than `STUDIO_RUNNER_GUIDED_ENABLED` are proposals (tag [P]); the ruling leaves them to this drop.

## Hygiene

- Files written: `launch-contract.md`, `receipt.md` (this directory).
- No git writes, no installs, no Gradle, no dist rebuild, no signal sent to any process, no secret logged or read (no key file or token was opened; the only certificate read was the public test fixture, for its validity dates).

## Cross-lane note

Lane PR-RT measured that the guided server ends an unanswered request with no HTTP response at its 30 s socket timeout (`pr-rt/receipt.md`, finding 2). That bears on contract question Q7 (which listener timeouts the single listener keeps) and was added to Q7 after the probe ran.

## Final digest

`launch-contract.md` sha256 `b94beadb7b3cefc014fba85218d21d7a73c9daabbeaf974cd247ce951926f3f2` (after the one post-draft edit to Q7 and the anchor corrections).
