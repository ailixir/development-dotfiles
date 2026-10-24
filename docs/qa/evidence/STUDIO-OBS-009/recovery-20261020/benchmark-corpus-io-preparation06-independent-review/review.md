# Independent corpus I/O06 source review

Verdict: HOLD FOR ONE SOURCE CORRECTION AND THE EXPLICIT TWO-INVOCATION REBIND. This is a review of unexecuted projection sources, not a story QA verdict or runtime authority.

All six preparation artifacts and both original public code files were rehashed before code review. No reviewed program was parsed, imported or executed. No corpus/business manifest body, private pin payload, SDK body, catalogue body, raw command output or external service was read.

## Concrete finding: IO06-QA-01

The membership and delta results use `!existsSync(MANIFEST+'.next')` at io-membership-and-delta.mjs.txt:63 and :92 as proof of `.next` absence. `existsSync` follows symlinks, so a dangling `.next` symlink produces an absent result. The original freezeManifest writes using ordinary writeFileSync before rename; a dangling symlink can therefore redirect the write to its target, including a target outside the admitted corpus. The stated dependent guard nextPathAbsentAtProjection=true is insufficient for this case.

Replace these absence observations with no-follow lstat semantics: only ENOENT means absent; any existing directory entry, including dangling symlinks, means present/HELD; other errors remain unavailable. Bind the no-symlink parent and root sole-writer window through the original freeze. Do not delete stale entries or alter the original validator. writePrivate's separate wx creation already refuses a dangling output symlink; this finding concerns the original CLI .next path and the exported absence fact.

## Freeze-first transition and minimum rebind

The original CLI freeze-corpus branch calls freezeManifest first and then strict validateCorpusManifest with default checkFiles=true. It legitimately repins stale source hashes before validation; no preliminary validate is required inside this branch. It writes and renames before strict validation, so nonzero exit can follow a real mutation. Preserve owned before/after bytes/modes, original exits, raw private output custody, and stop all dependent work on failure; any recovery must be explicitly bound to owned bytes.

The currently unexecuted source explicitly inventories the historical three-invocation recipe. Before actual execution, remove VALIDATE_BEFORE from membership events and manifestReadPhases; bind the actual order as FREEZE reads -> FREEZE_INTERNAL_VALIDATE -> VALIDATE_AFTER. Replace the old validateBeforeToFreeze command guard with freeze prerequisites. Retain raw-exit0/errorCount0/complete projection guards for freeze and final validate; require final validate.valid=true. Retain the complete nonderived-scope and no-follow .next checks before accepting freeze. This is an acknowledged recipe rebind, not evidence that an unbound private input failed or that an additional preliminary validation should run.

## Source conclusions without additional findings

The declared read membership matches the original success-path semantics: source/case/page/fixture pins, repeated internal/post validation, and the separate corpus-root semantic expected JSON read. The port results SHA is assigned from an already repinned source; it adds no separate payload read. Module-load membership remains a separately bound prerequisite, not observed I/O. Logical multiplicities are openly conditional, not syscall measurements.

The delta mask matches the original freeze's source/case/page/fixture/port SHA fields, six derived gate fields, three session-plan fields, real timestamp and digest. All other parsed business values, keys and array order participate in equality. It reports equality and changed counts without reimplementing validity or accepting a digest. Root must require the true equality result; projectionComplete alone is not acceptance.

Both output paths preserve privacy in their admitted scope: source helper error text is fixed; the output projector emits fixed typed fields/counts/hash facts and never prints arbitrary errors, gate/sessionPlan bodies or exception strings. It retains the original nonzero child exit, while a failed projection after original exit0 exits2. The Python projector relies on assertions: actual execution must explicitly bind Python optimization disabled (no -O and PYTHONOPTIMIZE ineffective/absent), otherwise its safety and closed-shape assertions are not enforced. This is a required runtime binding, not a measured fact or a demand to run the program now.

Fresh manifest/source/full metadata refs, pin regular/no-symlink attestations, imported-code refs, exclusive private captures/output modes, raw exit ownership, current revision-corrected candidate and SDK applicability are deliberately unbound. These are execution prerequisites, not additional source defects. No source execution, provider authority, backend call, source adoption, lifecycle transition, or release is granted by this review.
