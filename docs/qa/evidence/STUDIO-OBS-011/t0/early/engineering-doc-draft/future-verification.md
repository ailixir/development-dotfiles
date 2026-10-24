# Future root verification and application commands

Run from the repository root. These commands were prepared for future use; only the static
unapplied verifier and combined patch dry-run were executed by this lane.

Before application, root must reconcile original B1, complete fresh B7 and announce tree-open,
transfer quoted-document/file ownership, and confirm CLN-51 wording. Existing UAT deploy note
is already present in unchanged §14.4. Actual external deployment inputs remain separate.
Any source changes after this audit require a review of affected prose; hashes/marker presence
do not replace that semantic review. A changed original target hash means stop and rebase the
preview with its owner; do not force or fuzz the patch.

```sh
# Read-only: original target hashes, exact patch reconstruction, source references,
# CLN51 equality, inventory prefix, dates and unchanged runbook sections.
python3 -I docs/qa/evidence/STUDIO-OBS-011/t0/early/engineering-doc-draft/verify-package.py

# Read-only application check for the five authored-document targets.
patch --dry-run --batch -p1 < docs/qa/evidence/STUDIO-OBS-011/t0/early/engineering-doc-draft/patches/authored-docs.patch
```

Only after root opens the tree and grants the relevant writer ownership:

```sh
patch --batch -p1 < docs/qa/evidence/STUDIO-OBS-011/t0/early/engineering-doc-draft/patches/authored-docs.patch
python3 -I docs/qa/evidence/STUDIO-OBS-011/t0/early/engineering-doc-draft/verify-package.py --authored-applied
```

AGENTS.md and studio-runner/README.md wait for root's **11-MERGE**; neither is an ordinary
11-DOC real-tree write. Recheck source/target identity and obtain the exact ownership baton:

```sh
patch --dry-run --batch -p1 < docs/qa/evidence/STUDIO-OBS-011/t0/early/engineering-doc-draft/patches/root-merge-only.patch
patch --batch -p1 < docs/qa/evidence/STUDIO-OBS-011/t0/early/engineering-doc-draft/patches/root-merge-only.patch
python3 -I docs/qa/evidence/STUDIO-OBS-011/t0/early/engineering-doc-draft/verify-package.py --applied
```

Optional focused read-only inspection (the first grep intentionally still finds the dated
historical flag paragraph; inspect its immediately preceding dated correction):

```sh
rg -n 'studioAuthoringV2|STUDIO_AUTHORING_V2_ENABLED|STUDIO_INCREMENTAL_ENABLED|complete API lifecycle' docs/runbooks/studio-inference-rollout.md
rg -n 'validateArtifact|^## Bounds|^## Accepted language|^## Fixture corpora' docs/qa/evidence/STUDIO-OBS-011/t0/early/engineering-doc-draft/README.md.patched
```

The second grep must return exit 1/zero matches, while its positive-control search
`rg -n '^## Security model' .../README.md.patched` must match. The verifier checks both presence
and absence deterministically, including oracle wording and current-source positive controls.

Independent review, root R-AI archive receipt and the unchanged complete 11-G gate obligations
remain owed. This documentation package does not run or waive backend/runner/frontend gates,
build an image, make a provider call, clear an external release prerequisite or change lifecycle.
