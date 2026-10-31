# Verbatim copy of the spike's pure functions (freeze B)

`spike-pure.cjs` holds the pure functions of the SPK-07 spike at freeze B (harness sha256
`c46e72077cae491c919254b961571842919b4bb80b3dcad963b141b34f8b6388`): the sanitizer, annotator, renderer and focus projection of
`lib/perceive.mjs`, the gates of `lib/arms/S3.mjs`, and the offline G1/G2 of the `regate-v3` analysis. Only the leading `export ` of each top-level declaration was removed and one `module.exports` line appended.

The spike directory (`evaluation/grounding`) is untracked tooling. Tests use this copy, so they run anywhere:

- `test/run/perceive.test.ts` runs it against the new pipeline on the raw objects the spike collected (AC1 layer 1);
- `test/fixtures/perception-parity/parity.ts` and `capture-spike-baseline.mjs` require it for the perception parity baseline.
