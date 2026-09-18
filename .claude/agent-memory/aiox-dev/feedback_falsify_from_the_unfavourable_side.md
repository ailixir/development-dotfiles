---
name: falsify-from-the-unfavourable-side
description: Choose the mutation your guard is least likely to catch, not the one it was built around — a favourable mutation proves nothing
metadata:
  type: feedback
---

When falsifying a guard, pick the input that your guard's own scoping makes it **least** likely to
catch. If the guard filters by a prefix, mutate with a key that matches **no** prefix. If it checks
a list, add something not on the list. If it is scoped to a directory, plant the canary one
directory out.

**Why:** story 10.18b, QA TEST-001. I wrote a discrimination control that filtered `envFrom`
violations by this story's five naming prefixes, then falsified it with M15's
`STUDIO_SSE_HEARTBEAT.seconds` — which matches a prefix. Red, recorded as working. @qa used
`checks.studio.qa-probe-7255`, which matches none, and the tier reported **4 failed / 3 passed,
byte-identical to the unmutated baseline**. The guard had never been shown to catch anything it was
not already shaped around. It was the epic's twentieth vacuous-guard shape and it was in a *control
I added specifically to prove non-vacuity*.

**How to apply:** before running a mutation, ask "what is the cheapest change this assertion would
miss?" and run that one first. State the mutation you chose **and** the one you rejected, in the
record — a falsification table that only lists favourable mutations reads as evidence and is not.
Two specific traps: mutating a **sibling** symbol rather than the one the test names
([[structural-guard-mutation]]), and mutating **inside** an assertion that is already failing, where
nothing can move. Related: [[vacuous-guard-shapes]], [[epic10-falsification-standard]]
