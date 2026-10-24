# AIOX Lean Delivery in put-checks-ui-studio

This project uses the shared workflow at `/Users/brunobuger/workspace/startup/aiox-lean-workflow` through the
[package registration](lean-delivery.json). Only a thin launcher and client entry
are local; implementation, tasks and checks remain in the shared package.

## Use it

| Client | Command | Context source |
|---|---|---|
| Codex | `$aiox-lean` or select it in `/skills` | `AGENTS.md` and `.agents/skills/aiox-lean` |
| Claude Code | `/aiox-lean` | `CLAUDE.md` and the local `.claude/skills/aiox-lean` link |
| Cursor | `/aiox-lean` | `AGENTS.md` and the real `.agents/skills/aiox-lean` directory |

Examples in chat: `aiox-lean start` with the feature request, or `aiox-lean status`
with the known state path, using the client-specific prefix above. The context
aliases `*lean` and `*run-workflow lean-delivery` use this same shared driver.
They must not invoke the project's old generic workflow engine.

From the project root:

```sh
node tools/aiox-lean.cjs doctor
node tools/aiox-lean.cjs --help
```

`doctor` is a project-launcher command. It validates package resources, version,
local skill wiring and context markers; it does not invoke a model, run product
checks or create workflow state. The remaining commands are forwarded to the
shared companion, for example:

```text
node tools/aiox-lean.cjs init --input /absolute/init.json
node tools/aiox-lean.cjs next --state /absolute/state.json
node tools/aiox-lean.cjs status --state /absolute/state.json
```

For each new chat activation, require the project `doctor` to succeed before
loading the shared driver. One successful check covers that activation while the
package/version stays the same. A failed check must not fall back to another AIOX.

For a real feature, the agent loads
`{packageRoot}/.aiox-core/development/tasks/run-lean-delivery.md`, prepares a
work-item contract and binding with actual identities/authorized inputs/checks,
and executes the workflow. Choose an explicitly authorized state directory outside
this project and permitted by the native sandbox. No run or fake work item is
created by making the workflow available. A read-only reviewer returns evidence;
the authorized coordinator records it unchanged.

## Preserve this project's rules

Select checks for the affected area and the actual work item. Existing entrypoints
include `pnpm run type-check`, `pnpm run lint`, and `pnpm run test --run` in
`frontend/`; `./gradlew test` and `./gradlew check` in `backend/`; and the documented
runner checks in `studio-runner/`. Preserve required integration/repetition rules.
The root `npm test` is a placeholder, not the project's acceptance gate. Existing
stories, authority boundaries, accessibility scope and active execution records
remain governed by project instructions. This integration does not alter the
vendored AIOX runtime or any active run.

Keep the native session rooted in this project. Explicit Lean selection replaces
only the default delivery sequence for that new work; it does not weaken product
requirements, permissions, story authority or testing obligations. Existing
SDC/spec/discovery work stays on its pinned route unless explicitly reconciled.
Use Orca lifecycle only for actual supervision/live Dispatch; availability does
not create Orca coordination state. Help and status are not acceptance or release.

## Host paths and client refresh

The real local skill wrapper avoids Cursor's project symlink containment limit.
Claude follows a link to that same wrapper. No duplicate legacy slash command is
installed. If a running client cached skills before installation, refresh its skill
list or open a new session in this project; do not interrupt existing work to do so.

If the shared checkout moves, update `packageRoot` in `lean-delivery.json` or supply
an explicit `AIOX_LEAN_PACKAGE_ROOT` override, then run `doctor`. There is no fallback
to an older local/global AIOX. Check package/version changes deliberately; a path
or version check is not a claim that every later source edit was reviewed.

Native discovery conventions: [Codex](https://learn.chatgpt.com/docs/build-skills),
[Claude Code](https://code.claude.com/docs/en/skills),
[Cursor](https://cursor.com/docs/skills).

## Installation verification (2026-10-23)

The local doctor, companion help, skill frontmatter/resources, launcher argv and
exit-code propagation, version mismatch and missing-package refusal were checked.
Codex's native `skills/list` returned one enabled `aiox-lean` entry for this project
with no discovery errors, without starting a thread or model turn. Claude and
Cursor wiring follows their supported discovery paths; their live menus were not
opened. Existing context bodies were preserved before the appended Lean block.
No product test suite, workflow run or migration was started by these checks.
