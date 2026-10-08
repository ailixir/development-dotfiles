---
name: phantom-honesty-test
description: CredentialScreenHonestyTest is named in CredentialPatternScreen javadoc but never existed; real guard is PromptAssemblyTest, backend-only
metadata:
  type: project
---

`CredentialScreenHonestyTest` does not exist in the repo or in git history (checked 2026-10-05). It is named only in the javadoc of `CredentialPatternScreen.java`. The real guard is `PromptAssemblyTest#noMessageInTheModuleClaimsCredentialDetectionIsComplete`. That test pins `LIMITATION` verbatim and scans backend messages only. Frontend credential copy has no automated honesty guard.

**Why:** the secrets-disclaimer requirements (@pm) cited the phantom test as an NFR metric, which would let a spec name a test that cannot go green.

**How to apply:** when a spec or plan cites credential-honesty enforcement, point to PromptAssemblyTest. If frontend copy has to be guarded, require a new FE assertion.
