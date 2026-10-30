# Golden gate verdict vectors (ADR-SC-007 D3, WI-2)

Fixtures for the Java ports of the gates (WI-3) and for the runner's own checks. The gates are the pure functions of the SPK-07 spike
(`lib/arms/S3.mjs` `intentGate`, `operationTargetGate`, `actionGate`, and the offline G2 of the `regate-v3` analysis); a committed
**verbatim copy** of them is `../spike-pure/spike-pure.cjs`. No test reads the untracked spike directory.

| file | what it is |
|---|---|
| `classification.mjs` | The EXACT / PARTIAL rule and the list of lossy transforms (L1 to L6). Fixed **before** any recorded verdict was compared; its sha256 is pinned in `test/run/goldenGateVectors.test.ts`. |
| `extract-gate-vectors.mjs` | Reads the recorded runs `s3v2-20261027` and `wave2-20261027` (read-only), rebuilds each row's gate inputs from the recorded request outline, classifies the row, and writes `s3-gate-vectors.json` and `PARTIAL-ROWS.md`. `--check` compares the committed files with a fresh extraction (run it by hand where the untracked runs exist; no test reads them). |
| `s3-gate-vectors.json` | 529 recorded S3 ACTION rows: rebuilt inputs, the recorded harness codes (`steps.jsonl` `gateCodes`), the verdict of the spike functions on those inputs, the class of the row, and for each action row the plan, reply, obligation and inputs verbatim (plans are stored once, by id). |
| `PARTIAL-ROWS.md` | Generated report: counts, the agreement on EXACT rows (0 differences), and **every PARTIAL row with the input it lacks**. |
| `make-synthetic-vectors.mjs`, `synthetic-gate-vectors.json` | Hand-written inputs with hand-written expected verdicts for every branch of the intent, operation-vs-role, G2 and action gates (including the dedupe branch, a missing `sourceReferences` entry, an undefined node, the iana-assert-01 sibling-cell case). `spikeDiffers` marks the one known divergence (the spike G2 has no NFKC). |

## How the vectors are checked

`test/run/goldenGateVectors.test.ts` compiles the verbatim copy as a new script under V8 **precise block coverage**, evaluates every
recorded and synthetic vector, and requires (1) 0 differences between the recorded harness verdict and the spike function on every EXACT
row, (2) the expected verdict on every synthetic vector, and (3) that no block of the gate functions went unexecuted. If V8 coverage is
unavailable the test fails ("AC6 mechanical coverage is NOT MET"); there is no fallback.

## Reading a PARTIAL row

A PARTIAL row is one where a gate input went through a lossy transform on its way into the outline (see the header of
`classification.mjs`). Its recorded verdict is kept, the spike function's verdict on the rebuilt input is reported, and a difference there is
expected and **not** a failure. A difference on an EXACT row is a finding: it is never fixed by editing the rule.

The intent gate over `facts` (`name`, `evidence`) is what the Java gate sees: every intent vector carries `facts` next to the spike `node`.
