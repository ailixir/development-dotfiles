# Original held-session reconnection assessment — 2026-10-20

Aria / aiox-architect. Read-only architecture assessment; this document is neither a technical-owner ruling nor an operational grant. **No working reconnection path is verified in the available interfaces. The immediate dependency is access to the original execution host's live session I/O and completion handle.** Resource disposition and story credit remain HOLD.

## Evidence and limits

Read the [resume handoff](../../../../STUDIO-OBSERVED-NEXT/RESUME-HANDOFF-20261019-CODEX.md), [Source08 recipe](../../early/gateway80-failed-red-resource-prep/resume8/RECIPE.md) and [complete Source08 findings/root adoption](../../resume2-gateway-failed-resource-source08-all-findings-root-adoption.json). The adoption retains both complete reviews and the mandatory `FR08-REGISTERED-READER-PATH-ALIAS-BYPASS` finding. Source08 is immutable HOLD; revision B remains a proposed exact correction, with no transfer of owner/runtime authority.

Root reports that its actual empty `write_stdin(session_id=29815)` returned `Unknown process id 29815`. Root's separate read-only metadata observation found wrapper3720 and shell3749 alive with the recorded Oct19 12:48:37 starts. Those are relayed observations, not independently repeated here. An unavailable tool registry handle does not establish process exit; matching process metadata does not establish restored I/O, exact holder/kernel/source qualification or completion status.

Additional reads were restricted to the explicitly named public wrapper, Source08 `failed_gateway.py`, `entry.py`, `guard-failed-red.bash`, and prospective Source09 `runtime.py`/`RECIPE.md`. Consulted current exposed tool descriptions and local `orca skills get orca-cli --json`, `orca --help`, `orca agent --help`, `orca terminal --help`, and terminal list/send/switch help. These help calls returned0. No actual terminal listing/output read, session search, held-shell input, process command, observer/helper invocation, native run, network request, protected body access, source edit or test occurred. The only repository write is this assessment.

## Supported interfaces and missing capability

| Interface | Verified contract | Consequence |
|---|---|---|
| `write_stdin` | Accepts an **existing** unified-exec `session_id`; empty characters poll without input. No attach/import/PID parameter is exposed. | The original handle is the intended channel, but root's current lookup fails. Repeating the failed lookup cannot recreate its registry entry. |
| `exec_command` | Runs a command and may return its new session identifier. | Starting a command creates another execution context; it does not reconnect shell3749 or restore its readonly functions/consumed caps. |
| Orca terminal commands | List/read/send/switch operate on an Orca runtime-issued terminal handle. Help exposes no arbitrary PID/tool-session attachment or unified-exec import. | Numeric29815 is not documented as an Orca terminal handle. Switching a tab changes UI selection; prompt replay/agent launch does not recover a nested tool session. No original Orca-terminal mapping was verified. |
| Original `with-gradle-lock.py` | Opens the fixed lock, obtains `flock`, calls its command with `subprocess.call`, unlocks after that call returns, then exits with its status. | The wrapper exposes no reconnection socket, saved-I/O adapter or recovery command. Re-running it would create a different unit. |

The missing external capability is **execution-host access that can restore the original live unified-exec session registration and its existing stdin/stdout/PTY master plus actual outer completion reporting into an authorized tool context**, preserving wrapper3720/shell3749 and their existing state. Alternatively, the original tool-host context could continue through its original handle **if that context still retains it**. Neither capability is verified available. These describe required platform behavior, not an invented API or an instruction to inject into a tty. No supported in-repository implementation can manufacture the original I/O ownership or a lost completion trace from PID metadata.

If the platform supplies that capability, the first existing permitted action remains an empty poll through the restored original channel. Even a successful poll proves channel liveness only. Exact existing source/holder/kernel qualification and all separate operational grants remain necessary before subsequent actions. Do not send through an unverified Orca terminal, another shell, a direct tty/descriptor, debugger, signal, EOF or cleanup path.

## Why the original-holder boundary remains binding

Source08's guard consumes readonly once flags in the SAME shell before Python (`guard-failed-red.bash:8–24`), and reaches `builtin exit 1` only following successful guarded gate completion (`:159–169`). Its `Unit.register` and `observe` call the retained existing holder qualification (`failed_gateway.py:432–439`, `:478–483`). Source08 is source preparation, not an installed grant.

Prospective Source09 independently requires the observer to be a direct child of the held shell and that shell to remain a direct child of its wrapper (`runtime.py:770–784`). Its recipe explicitly requires failed03 wrapper1/postclose0/actual-QA/root closure **before** any new hold/capture. It supplies no recovery or alternate-holder authority for old03. No Source09 code was invoked.

The consumed FR04 once/facts and failed statuses remain immutable. No retry, reset, rebinding, old-grant transfer, source-window/lease change or prospective N04/FR05 creation follows from this assessment. Fresh qualified f9 and separately observed SAME-held0 must still be inspected before admission/archive/closing through the existing reviewed observer. Actual wrapper1, outer postclose0, observer completion and independent actual closure QA/root remain owed; metadata liveness cannot substitute for any of them.

## Work that can remain disjoint

Subject to root's existing coordination, exact saved task/context and successful SAFE preflight, the **minimal immutable Source08 revision-B preparation and exact affected independent source reviews** may proceed in fresh approved evidence directories without accessing the held resource, protected bodies or leased application source. This assessment authorizes no such dispatch, tests or runtime steps; new clean reviews/root acknowledgement/three exact owner decisions and later actual scopes remain separate requirements.

For009/010/011, document-only work on unsealed, unleased outputs may reconcile existing public citations, enumerate remaining external proofs, or prepare pilot/release checklists from already permitted evidence. It must preserve actual statuses and missing inputs. The handoff's C-OBS008-3 citation extraction is a candidate for that narrow lane. Contacting people, inventing external evidence or closing stories does not follow. File ownership and lease membership must be established before selecting any additional output.

Application/backend/frontend edits, optional Javadoc or mirror changes affecting guarded source, fallback implementation, baseline-failure reruns, heavy tests and fresh source qualification cannot be called disjoint merely because they belong to another story. Defer them until the exact existing lease allows them or proper resource closure is established. No new adapter, framework or scope amendment is proposed.

C8 synthetic qualification and GST auxiliary infrastructure stay PARKED. Fresh backend check + JaCoCo before011 credit, final affected T5 suites, AC5/TEST-001, original assertions/skips/timeouts/default4000/Order17, protected Live surface, business/security/privacy, T0/root731, Replay, mainIR limits, external21 inputs and all lifecycle holds remain owed. No accessibility expansion, staging, commit, push or deployment. Dirty governance/unrelated work stays untouched. Shared USD500 aggregate spend remains UNKNOWN.
