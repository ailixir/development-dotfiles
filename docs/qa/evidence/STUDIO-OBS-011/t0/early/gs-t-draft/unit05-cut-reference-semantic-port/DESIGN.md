# Bounded controller-cut reference expectation port

This off-tree Transport preview implements only the expected-reference operand exception adopted by root `9f65eba05258ff63a283749b5712b0dcc5a81f2651f7112c80e0d82edc37d645`, bounded independently by Aria `d47561b3…` and Quinn `b238459b…`. It is a source-only port for `GST-CUT-REF-PROVENANCE-01`, not a production change, completed three-file composition, execution release, or runtime remedy proof.

The predecessor is the exact formatted unit05 Transport archive, SHA256 `7856020f0fb27e9bca9c1d1f235bd9a0c2eecd3bf135b7c16c6c7aa4ad4f269d`. In its shared, unannotated `runGuidedControllerCut` helper, a local `expectedReference` is calculated before the terminal summary SQL query. The calculation uses only the known ordinary inputs `STEP_ID`, secret name `PASS`, slot `fill.value`, UTF-8, and Java's UUID name rule:

```java
String expectedReference =
    "cfg-"
        + UUID.nameUUIDFromBytes(
            (STEP_ID + ":secret:" + "PASS" + ":fill.value")
                .getBytes(StandardCharsets.UTF_8));
```

`STEP_ID` comes from the unchanged public contract fixture's `documents.secretReference.stepId`. `PASS` is the same ordinary declaration written by `prepareGuidedControllerCut` and checked elsewhere in the case. The unchanged production classifier defines the naming rule at `GuidedSourceClassifier.java:150–154`. The preview expresses that rule directly; it never calls the classifier or reads a manifest, selected input, action, summary, or row to obtain the expected value. Independent Python text preparation computes the public tuple's name UUID with MD5/version3/RFC variant bits and obtains `cfg-0d0b8087-472c-3972-b1ba-7eec3eb4518e`. That value is an independently derived expectation, not an observed private audit value or Java/runtime result.

The only changed assertion operand is `"ref-PASS"` → `expectedReference`. The whole original assertion remains the same four-field conjunction ending in `.isTrue()`, with exact equality against the real SQL summary's `source_reference_id`. The `STEP_ID`, ordinal0, and `id + ":1"` conjuncts remain exact. No reference is renamed in the source manifest, materialization, action, or audit row, and the genuine source/input/ledger/terminal/SQL lineage stays the asserted subject. All other `ref-PASS` occurrences, including the old fixture map, are unchanged.

`setup-input-assertion-map.json` contains the full insertion and anchor, public input provenance, both unchanged annotated callers and bodies, the full old/new assertion expressions, three untouched conjuncts, and all541 assertion occurrence hashes. Assertion315 is the single mapped occurrence. `bindings.json` gives exact original/unit05/preview hashes and counts; Session and Lifecycle are bindings only, with no copies or edits here. Root will compose them separately with the independently prepared Session port.

The verifier uses the previously inspected pure text helpers and exact two-splice reversal. Removing the one enumerated insertion and reversing the one enumerated operand yields every predecessor byte. Forward and reverse patches also recover the exact complete sources in memory. No whole-method exclusion or broad regex exemption is used.

Preservation accounting is explicit: all31 Transport annotated bodies are exact; its541 assertion expressions remain, with540 exact and one mapped expected operand. Across the unchanged Session/Lifecycle bases and this Transport preview, all80 ordered method names/annotations remain. The751 original baseline expressions are retained as750 exact plus one mapped expression; all813 unit05 expressions are retained as812 exact plus that map. All62 additive checks remain. The exact99-case catalog, nine Modes, 11 sentinels, negative probes, business oracles, timers, rollback/secret/budget/canary/native/SQL/authority and cleanup/genuine-completion subjects remain.

Only this new output directory was written. No shared source, main, Replay, FOLD port, story, plan, old seal, guard or helper was changed. There was no live shell/lock/process/census interaction, Java/compiler/SQL/Gradle/Node/native/probe/signal/network/provider/Git action, IR scratch/clock/call, or private evidence-body access. Actual row values, which unit05 conjunct failed, first cause, behavior, formatting/compilation, and complete remedy are unproven. The unit05 result remains91PASS/8FAIL/0SKIP.

A complete coherent three-file successor, exact composition/recipe/guard reviews by independent Aria and Quinn, fresh root binding/admission, and a fresh complete99PASS/0SKIP run remain required. All C8-hard-before-credit/main506/Replay/generalW1/IR/F1/GS-Mb/lane/baton/external/custody/lifecycle holds and historical reds/gaps remain.
