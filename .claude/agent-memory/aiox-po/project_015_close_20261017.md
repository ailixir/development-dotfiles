---
name: 015-close-20261017
description: 2026-10-17 STUDIO-OBS-015 admin close (CONCERNS) — close-file drift annotations go in sibling files, section-hash method, ED-05 remainder gap in OBS-010, closure key with a space
metadata:
  type: project
---

On 2026-10-17 @po administratively closed STUDIO-OBS-015 (story 0.1.22, `.ai/STUDIO-OBS-015-close.json`, schema 2 like 014).

Facts worth keeping:
- **Drift annotations are sibling files**, `.ai/STUDIO-OBS-0NN-close.drift-annotation.json`. The whole-file sha256 of the 014 and 012A close files is bound byte-exact in other receipts (014: strict-closure-receipt, administrative-closure-receipt, 008 po-scope-readiness; 012A: resume-20261014/start-manifest.json). Adding a field would break those bindings. Never edit a close file after it is bound.
- **Section-hash method** that reproduces the 014 `QAResultsSha256Before`: the bytes from the `## <name>` heading line up to, but not including, the next `## ` heading.
- **Drift proof method:** remove the exact post-closure blocks, then confirm the result hashes to the recorded `storySha256After`. Both 014 and 012A reproduced exactly. All their drift came from the 2026-10-16 bridge-disclosure placements (014 0.1.19, 012A 0.2.7).
- **Closure key** = `<id>:digest:<reviewed_revision verbatim>`. QA's 015 value contains a space (`source-digest:… dist-digest:…`). It was kept verbatim.
- **The QA Done-time story was not preserved.** Root reported sha `b1b6c171…`, then edited the T0 text, so `restoresExactQaReviewedStory` is false. Ask root to snapshot the story before any post-Done edit.
- **Open gap, flagged to the lead and not fixed:** for REQ-002, the ED-05 remainder (internal image, non-root user, seccomp, CA bundle), the gate says OBS-010 owns it. But OBS-010 AC-4 d row e struck all of ED-05 on 2026-10-16, and no 010 row names the remainder. It is tracked only in the GA plan :83, SPK-04, and 009 register U4.

**Why:** the lead asked for the 014-schema close plus drift notes without rewriting recorded hashes.

**How to apply:** reuse the sibling-file pattern and section method for later closes. Check whether the REQ-002 gap was later placed before raising it again.

See [[studio-observed-wave-po-conventions]] and [[015-gate-followups-20261017]].
