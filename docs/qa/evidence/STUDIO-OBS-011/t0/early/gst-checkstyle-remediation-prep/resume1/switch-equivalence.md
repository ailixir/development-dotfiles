The only non-brace token change is in `GuidedServiceTransportFaultIT.observeGstCallback`, the local `fixedRoute` declaration and switch at accepted lines 5282–5289. `source-location-map.json` retains both exact spellings. The seven projected indentation rows refer to this one expression. The statement spelling avoids the assignment-continuation indentation conflict; formatter and Checkstyle acceptance are still unexecuted.

| Selector | Previous expression result | New statement assignment |
| --- | --- | --- |
| `"claim"` | `"CLAIM"` | `fixedRoute = "CLAIM"` |
| `"observations"` | `"OBSERVATIONS"` | `fixedRoute = "OBSERVATIONS"` |
| `"bootstrap-evidence"` | `"BOOTSTRAP_EVIDENCE"` | `fixedRoute = "BOOTSTRAP_EVIDENCE"` |
| `"outcomes"` | `"OUTCOMES"` | `fixedRoute = "OUTCOMES"` |
| Every other non-null String | `"OTHER"` | `fixedRoute = "OTHER"` |

Both forms evaluate the same local String method parameter `route` once, at the same position after the error-code parsing and before `gstDiagnosticLine`. They use the same case labels and literal results. Arrow rules do not fall through. Each normal arm assigns `fixedRoute` once; default covers all other non-null Strings. The uninitialized local declaration performs no expression evaluation or externally observable operation. Its lexical block remains the existing `try` block; no method or helper is introduced. Java definite-assignment compilation is explicitly owed.

Neither switch has a `case null`. A null selector throws `NullPointerException` before assignment in both forms; the existing same `catch (Throwable observationFailure)` handles it and calls `gstDiagnosticUnproven`. No observation or new exception handler is added. No case expression invokes a method or has a side effect. No raw selector reaches a diagnostic: the same fixed five output literals remain the only possible normal values. The original `status == 202` early return, surrounding parse and validation, diagnostic arguments, and catch body retain their token sequences.

The brace edits wrap exactly one existing statement each, with the condition and statement tokens preserved. These statements are returns, throws, assignments, increment, or invocation expressions. None declares a variable, introduces a label, nests a conditional, or uses break/continue. Braces therefore add no competing variable scope and cannot alter dangling-else binding: each diagnosed existing `else` remains paired with its previous immediately enclosing `if`. Source verification locates each full `if/else` head plus its exact statement inside one new brace pair. All other original braces, method declarations, literals, comments, operators, assertions, argument order, and tokens remain exact after normalizing only the explicitly mapped switch.

This is source reasoning and lexical preservation evidence. It grants no Java compilation, formatter, Checkstyle, runtime, failed-test cause, current C8, or lifecycle credit.
