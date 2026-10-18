---
name: frozen-fixture-values
description: Never change a frozen JOIN fixture value (e.g. ReplayIT variant inputs) to make a refusal disappear; treat the refusal as a production finding and disclose any diagnostic change up front
metadata:
  type: feedback
---

Do not edit a frozen test-fixture input so that a product refusal goes away. In STUDIO-OBS-015 G, I changed the `config` variant's `timeoutSeconds` from 31 to 29. The product accepted 1–120 s but the runner refused anything over 30 s, so the change would have hidden that defect. QA (Quinn) required reverting it and recording the defect.

**Why:** a fixture tweak that makes a run green hides a product defect, and QA treats an undisclosed change as a review finding.

**How to apply:** when a refusal disappears with a different fixture value, keep that run as a no-credit discriminator only. Revert to the frozen value, file the mismatch as a production finding with fix options for the architect, and state any temporary change before reporting results.

Related: [[replayit-c5-finalize-lease-and-s2-order]].
