# resume1 removed from the branch tip

`resume1/` was removed on 2026-11-02. It held files named `nul.*`, and Windows reserves `NUL` as a device name, so the branch could not be checked out on Windows.

The folder is unchanged in history at commit `64136dc47` (2026-10-23, "docs(qa): OBS-011 T0, recovery and final-sweep evidence record"). Evidence that pins `resume1/manifest.json` refers to that copy.

    git ls-tree -r --name-only 64136dc47 -- docs/qa/evidence/STUDIO-OBS-011/t0/qa/gateway80-source07-bash32-delivery-review/resume1
    git show 64136dc47:docs/qa/evidence/STUDIO-OBS-011/t0/qa/gateway80-source07-bash32-delivery-review/resume1/manifest.json

On Windows, read the files with `git show`; the `nul.*` names can't be written to disk there.
