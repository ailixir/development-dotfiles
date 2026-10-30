# AC1 parity baseline (ADR-SC-007 D1, WI-2)

What the SPK-07 spike's `perceive.mjs` produced at freeze B for every observed-authoring fixture page and the committed large pages
(`pages/`, 600+ nodes, a 150-option select, a 90-option listbox, 1,000 labelled inputs), two passes each (no private values; two private
values taken from the page).

| file | what it is |
|---|---|
| `capture-spike-baseline.mjs` | Verifies freeze B (the files this baseline runs are byte-identical to `corpus/freeze.json`), builds the private inventory itself (so the spike never rewrites `generated/*.meta.json`), runs the spike, and writes the two files below. Needs the spike, the frozen collector copy `evaluation/grounding/generated/frozen-dist/run/observationCollector.js` (read only; the collector is deleted from `dist/` by ADR-SC-007 WI-4) and Chromium. |
| `baseline.json` | Per page and pass: the outline, the facts derived from the spike nodes, the counters, the inventory and the projection summary; the freeze-B harness sha256 and the 33 per-file sha256s; the sha256 of the production collector; the **environment fingerprint** (Chromium build, platform, a hash of text metrics). |
| `collected.json` | The raw objects the spike's in-page program collected (snapshot tree, element facts, echo set, boxes), one per page. |
| `differences.json` | Every documented difference between the spike and the new pipeline, with its kind and reason. The tests require the actual differences to **equal** this document: no undocumented difference, no stale entry. |
| `spike-facts.cjs`, `parity.ts` | The facts derivation for spike nodes (the spike has no facts table) and the comparison helpers shared by both layers. |

Layer 1 (`test/run/perceive.test.ts`, portable) runs the committed verbatim copy of the spike pipeline and the new pipeline on `collected.json`.
Layer 2 (`test/fixtures-tier/perception/parity.test.ts`, live) additionally checks the in-page port and the layout. Layer 2 is machine-bound:
if the environment fingerprint differs it **fails**, it is never skipped; re-capture with `node test/fixtures/perception-parity/capture-spike-baseline.mjs`.
