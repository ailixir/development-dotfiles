---
name: tooling-profile-safety-default-recreated
description: browser-profile-safety "redirected Default" fixtures case fails EEXIST ~7-13% in cold single runs because live Chrome re-creates Default; run it in a scratch clone with a no-globalSetup config
metadata:
  type: reference
---

`test/fixtures-tier/browser-profile-safety.test.ts` "refuses a Default directory redirected after actual launch": `symlink(outside, profile/Default)` fails EEXIST because live Chrome re-creates `Default` (only `Extension State` inside, born within ~1 ms) between the test's rename and symlink. Cold single-process runs: 13/100 fail at baseline host load, 7/100 under 11 busy loops, so a phase race, not load-driven. In the full tier it mostly passes (warm worker). Persisted `profile-safety.json` signature: `renamed true, canaryCreated true, symlinkInstalled false, primaryCode EEXIST`. Proposed fix (move the re-created dir aside and retry, max 20) went 0/200 in w11-hard-expiry01/profile-safety/ (patch not applied unless the coordinator decided).

**How to apply:** to hammer a fixtures-tier test many times without touching repo evidence, run it in an existing APFS-clone scratch tree (`scratchpad/dex-w11-hard-expiry/fullfix`) with a config object file that sets `root` to the clone and omits `globalSetup` (~1.5 s per run; filter with `-t` on text that is really in the title: "Default directory redirected", not "redirected Default", which silently matches nothing and reports 10 pending). Stress with `bash -c 'while :; do :; done'` loops whose PIDs are written to a file; kill only those.
