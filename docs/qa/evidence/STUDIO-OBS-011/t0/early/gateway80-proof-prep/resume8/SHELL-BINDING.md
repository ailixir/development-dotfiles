# Prospective same-buffer shell delivery

Use this delivery sequence wherever RECIPE.md says to source an inspected shell template. It replaces a pathname reopen with evaluation of the actual verified readonly buffer. This is source preparation; no source8 shell compatibility or setup result has been obtained.

Root reported that delivering a large literal heredoc to an old held Bash3.2 session produced corrupted syntax, and a process-substitution attempt returned with producer BrokenPipe/wait127. This packet does not infer a cause or reuse those results as source8 proof. Do not deliver large template text through a PTY paste, process substitution or an asynchronous producer. Keep shell settings unchanged.

For capture, read the exact named public source member once with a builtin:

```bash
IFS= read -r -d '' G8_CAPTURE_SOURCE_BUFFER < "/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume8/capture-once.bash"
```

Wait for the prompt and capture its actual `$?` in a separate command. EOF status1 is expected for `read -d ''` when the complete NUL-free file has been consumed. Temporary `IFS=` and `-r` preserve the input and its newlines. Then make that new buffer readonly:

```bash
readonly G8_CAPTURE_SOURCE_BUFFER
```

Use the already separately qualified canonical launcher in the foreground to hash the **actual variable argument** against the independently supplied capture member SHA from the accepted manifest:

```bash
"/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/bin/python3.13" -I -B -c 'import hashlib,sys; sys.exit(0 if hashlib.sha256(sys.argv[1].encode("utf-8")).hexdigest()==sys.argv[2] else 1)' "$G8_CAPTURE_SOURCE_BUFFER" EXACT_CAPTURE_TEMPLATE_SHA
```

Wait and separately capture actual0 before proceeding. Inspect the named readonly variable and exact small wrapper definition; never dump all shell variables. The following small wrapper is literal reviewed operator code, entered independently of the large buffer:

```bash
function gateway8_bind_capture_buffer() { eval "$G8_CAPTURE_SOURCE_BUFFER"; }
readonly -f gateway8_bind_capture_buffer
```

Inspect `declare -f gateway8_bind_capture_buffer` and its named readonly state. Invoke it with the recipe's exact five capture setup arguments. Function-local positional arguments make the unchanged template see precisely those arguments; `eval` consumes the SAME immutable verified buffer:

```bash
gateway8_bind_capture_buffer MANIFEST_SHA EXTERIOR_CAPTURE_ENTRY_PATH ENTRY_SHA ACTUAL_NEW_SHELL_PID ACTUAL_NEW_WRAPPER_PID
```

Wait and capture actual setup0 separately. Inspect readonly `gateway8_capture_once`, its manifest/entry/launcher/loader bindings and the retained buffer hash before the once-only capture call. Any read/hash/evaluation/binding discrepancy is HOLD and supplies no retry/re-source authority.

For the other members, follow the identical three separately inspected stages: builtin read into a **new** named variable, readonly plus foreground actual-variable hash/status0, then the exact small readonly argument wrapper and evaluation/status. Use these fixed pairs:

| Member | New readonly buffer | Literal wrapper body | Arguments |
|---|---|---|---|
| `guard-exit.bash` | `G8_GUARD_SOURCE_BUFFER` | `function gateway8_bind_guard_buffer() { eval "$G8_GUARD_SOURCE_BUFFER"; }` | manifest, actual release SHA, negative entry SHA, new shell PID, new wrapper PID |
| `author-control.template.bash` | `G8_AUTHOR_SOURCE_BUFFER` | `function gateway8_author_from_buffer() { eval "$G8_AUTHOR_SOURCE_BUFFER"; }` | manifest, exterior root-author request path, request SHA |
| `postclose.template.bash` | `G8_POSTCLOSE_SOURCE_BUFFER` | `function gateway8_postclose_from_buffer() { eval "$G8_POSTCLOSE_SOURCE_BUFFER"; }` | manifest, actual release SHA, postclose entry SHA |

Make each wrapper readonly with `readonly -f NAME` and inspect `declare -f NAME` before its first call. Substitute only the fixed member/buffer names in the read and verifier commands above, and use that member's independent manifest SHA. The author wrapper may evaluate its same verified code buffer for separately authorized new exclusive root-control requests; it cannot manufacture actual statuses. Capture, guard, final and postclose retain their own once-only scope. The outer postclose buffer is established in the outer context after actual wrapper0; it is not sent to a closed shell.

The operator trace must preserve exact member/buffer hashes, actual read/verifier/setup statuses, named readonly inspections and argument hashes. The verifier is an ordinary foreground command; it needs no async wait or job variable. Do not introduce interactive `$!` quoting/history-expansion dependencies. The root's requested-launcher and parent readonly attestations remain explicit operator evidence, not kernel image/object proof.
