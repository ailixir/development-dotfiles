# Linux limits row parser correction

This prospective fixture changes only the core-row regex suffix from `bytes$` to `bytes[ \t]*$`. Both numeric captures, beginning/end anchors, literal unit, multiline flag, and the original assertion requiring both captures to equal the string zero remain unchanged. All other fixture bytes, diagnostic stages and nullable facts, success output, source checks, timers, scenarios, callbacks, and cleanup are exact v2 bytes. The accepted shell ea56 and diagnostic schema9015 are untouched.

The primary source is [Linux v6.10 fs/proc/base.c](https://raw.githubusercontent.com/torvalds/linux/v6.10/fs/proc/base.c), proc_pid_limits, lines 562–600. Root supplied this location and excerpt after its primary-source browse; this task did not read an actual kernel or limits row. The relevant producer lines are:

```c
seq_printf(m, "%-25s %-20lu ", lnames[i].name, rlim[i].rlim_cur);
seq_printf(m, "%-20lu ", rlim[i].rlim_max);
seq_printf(m, "%-10s\n", lnames[i].unit);
```

The unit field has minimum width ten. The five-character bytes unit therefore has five trailing spaces. This confirms a standard-format parser defect: the original bytes$ rejects the kernel-generated padded zero/zero row. The replacement permits only horizontal space or tab at that suffix; extra tokens and wrong units remain rejected. This diagnosis does not establish the historical container's exact kernel version, row bytes, or limit values, which remain UNRETAINED/UNKNOWN.

Exactly one pure Node24 invocation read the two public fixture source texts as data, extracted their exact regex literals, compared the unchanged original core failure predicate, and checked eight fixed public strings. No fixture was imported or evaluated. The strings comprise one row generated with the kernel's 25/20/20/10 field widths, the existing unpadded zero row, and six negative controls: nonzero soft, nonzero hard, unlimited soft, unlimited hard, malformed unit, and extra token. The original rejects the padded valid row; the candidate captures zero/zero. Both accept the existing unpadded row. The candidate rejects all six negatives under the unchanged zero/zero predicate. Raw exit is zero and all eight source-format expectations pass. These are parser proofs, not native D2 evidence or new product cases.

Exactly one separate Node24 --check invocation returned zero, with no module evaluation. closed-source-parser-check.json retains the exact public input script, source regex literals, public samples, closed results, raw exits, byte counts, and output hashes. No check was repeated. No Docker, browser, /proc access, process observer, D2/native probe, historical raw leaf/log/private-body read, product test, driver edit, binder, new smoke, or Replay call ran.

Parent-supplied actual07 closed diagnostics establish inspect/core-limits/D2_CORE_LIMIT and null/null core flags, consistent with an unmatched row. Earlier actual counts are recording directory1, journals2, nonempty journals2, owners2, and live owned browser1; later inspection facts are null/unreached. Both negatives passed their original closed assertions and cleanup reported commandExit1/resources0. Actual07 remains NO_CREDIT with the active success fact missing and no drain/after/result settlement evidence. The standard-format defect supports this cause inference; the historical raw row itself was not retained or read. Actual future zero/zero still must be observed under the same oracle.

This owner packet requires root review and independent source QA before any separate future same-case admission. Future driver, bound packet, result, and QA runtime references remain UNBOUND. There is no self-approval, binding, lifecycle change, product/image/SDK/cache edit, deadline extension, Replay-cap reset, or automatic runtime authority. Failed05/06/07, v1/v2 and their seals remain historical and immutable. Backend4/5/6 remain unrun. The original deadline and shared USD500/headroom UNKNOWN remain unchanged.
