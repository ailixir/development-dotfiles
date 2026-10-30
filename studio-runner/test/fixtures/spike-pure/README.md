# Verbatim copy of the spike's pure functions (freeze B)

`spike-pure.cjs` holds the pure functions of the SPK-07 spike at freeze B (harness sha256
`c46e72077cae491c919254b961571842919b4bb80b3dcad963b141b34f8b6388`): the sanitizer, annotator, renderer and focus projection of
`lib/perceive.mjs`, the gates of `lib/arms/S3.mjs`, and the offline G1/G2 of the `regate-v3` analysis (`regate-gates.mjs`, copied as
written). Only the leading `export ` of each top-level declaration was removed and one `module.exports` line appended.

The spike directory (`evaluation/grounding`) is untracked tooling. Tests use this copy, so they run anywhere:

- `test/run/perceive.test.ts` runs it against the new pipeline on the raw objects the spike collected (AC1 layer 1);
- `test/run/goldenGateVectors.test.ts` evaluates the gate vectors with it and measures V8 coverage of it (AC6).

`node test/fixtures/spike-pure/verify-copy.mjs` rebuilds the file from the spike and requires it to be identical (run it where the spike
exists); `--write` regenerates it. The header of the copy lists the sha256 of every source file.
