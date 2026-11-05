# ADR-SC-009 — Runner host: posix production, win32 local development

| Field | Value |
|---|---|
| Status | **Accepted** (user decisions 2026-11-05). **Not verified on Windows** until a recorded Windows run (plan AC 15) |
| Date | 2026-11-05 |
| Scope | `studio-runner/src/run/host/**` and its callers in `studio-runner/src` (process tree, launcher, scratch, journal, object store, config defaults, signals, entry checks); the local launchers `studio-runner/scripts/dev.mjs`, `backend/scripts/dev.mjs`, `frontend/scripts/dev.mjs`; the backend test database |
| Supersedes | Nothing |
| Relates to | [ADR-001](ADR-001-studio-runner-scaffolding.md) (runner scaffolding, image contract, and the confinement of `node:child_process` to `src/run/**`, §6) |
| Decision source | User decisions 2026-11-05; the Windows/Linux support plan (Context, W0, W3–W7); the architect's read-only analysis of `studio-runner/src` (2026-11-05) |

Labels: [V] means verified by reading the code, or the libuv/Node/Playwright source. [I] means inferred from documentation or knowledge. Nothing in this ADR has been run on Windows.

## Context

- The developers who will maintain put-checks work on Windows. Bank Windows machines have **no Docker and no WSL**, so the stack must build, test and run natively there.
- Production stays the Linux container. The Dockerfile and Helm chart do not change.
- The runner assumes POSIX today. On Windows it cannot start or launch:
  - `ps` does not exist, so the startup guard exits 69 [V].
  - `process.getuid` is undefined and libuv reports every mode as 0o666, so every replay and guided launch is refused [V].
  - `O_NOFOLLOW` and `O_DIRECTORY` are undefined, so opens silently follow links [V].
  - The child env has no `SystemRoot` or `TEMP`, so Chromium has no network (Winsock 10106) and `os.tmpdir()` breaks [I].
  - Directory `fsync` returns EPERM [I].
  - The guided teardown's marker matcher needs a leading `/`, so on Windows it reports a clean teardown while Chrome is still alive [V].

## User decisions (2026-11-05)

1. Windows is supported on **developer machines only**. Production and image builds stay on Linux.
2. On Windows the runner supports **both guided learn and replay**. Replay is delivered first.
3. **PowerShell 5.1** `Get-CimInstance Win32_Process` is allowed on bank laptops. The win32 runner uses it for its process table.
4. The backend tests use **embedded Postgres (Zonky) on every OS**. Testcontainers is removed.
5. Windows gets the closest equivalent of each runner security check. Every gap is written down here.

## Decision

**D1. Selection.** The host is chosen once, from `process.platform`, in `src/run/host/index.ts`:
`host = process.platform === 'win32' ? win32Host : posixHost`. There is no flag and no env switch. The host lives under `src/run/**`, because `node:child_process` is confined there (ADR-001 §6). No npm package is added.

**D2. posix is unchanged.** `posix.ts` holds today's code, moved verbatim. Linux and macOS behaviour does not change. A posix-host pin test and the existing runner, image-build and deployment-tier checks prove it (plan AC 5).

**D3. No production on win32.** On win32 the runner refuses to start when `NODE_ENV=production`. The refusal message cites ADR-SC-009.

**D4. Fail closed.** If PowerShell or CIM is blocked, the win32 runner cannot read its process table, so it refuses to start. It does not fall back to running without a process table.

### Per-OS behaviour

| Concern | posix (production) | win32 (local development) |
|---|---|---|
| Process table | `ps` | `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -NonInteractive -EncodedCommand <constant>` running `Get-CimInstance Win32_Process` (pid, ppid, CreationDate, CommandLine). Called by absolute path with an enumerated env. The startup sync read is bounded at about 10 s |
| Tree and kill | ppid tree; group plus per-pid SIGKILL | child = ppid matches **and** CreationDate ≥ the parent's (Windows never rewrites ppid, so pids get reused); `taskkill /PID r /T /F` plus a kill per pid |
| Fork of the run child | `detached: true` | `detached: false, windowsHide: true`: libuv puts the child in its kill-on-close job, so the child's Chrome and ffmpeg die with it, and a runner crash cascades [V libuv]. With no console, only the runner receives Ctrl+C |
| Sampling and quiesce | 25 ms tree sampler | One snapshot after `ready`, no sampler. To quiesce: terminate the child, then poll `kill(pid, 0)` on the child and the snapshot pids, inside the existing bounds. Processes created after the snapshot are covered only by the job cascade |
| Guided teardown (`killLaunchTree`) | sync `ps -ww` | async CIM snapshot with command lines. Markers follow Windows rules (drive letter or UNC, `\`, case-insensitive); a match counts only if it was created at or after the launch start |
| Private root | uid plus mode 0o700 | `makePrivateRoot` uses `icacls` to set a protected ACL, by SID: current user, SYSTEM, Administrators. Read back as SDDL once at startup; children inherit it |
| Per-node checks | uid, mode, `O_NOFOLLOW`, `/proc/self/fd` (Linux) | type, not a symlink or junction (`isSymbolicLink`), nlink, and a bigint dev/ino check before and after the open (the fence is mandatory) |
| Directory fsync | fsync | No-op |
| Canonical paths | `realpathSync` | `realpathSync.native`; `isInside` based on `relative()`, case-insensitive |
| Remove | `rm` | `rm` with retries (`maxRetries`); in the quarantine, a sharing violation skips that item instead of failing startup |
| Child env | today's allowlist plus `TMPDIR` | `PATH`, `PLAYWRIGHT_BROWSERS_PATH`, `LANG`, `SystemRoot`, `windir`, and `TEMP` = `TMP` = `TMPDIR` = the scratch tmp. The code-loading guard also drops `COR_PROFILER*`, `DOTNET_STARTUP_HOOKS` and `PSModulePath` (no effect on Linux) |
| Drain signals | SIGTERM, SIGINT | SIGINT, SIGBREAK, SIGHUP |
| Entry-point check | today's `argv[1] === fileURLToPath(import.meta.url)` | one shared `isEntryPoint` that compares canonical paths (used by `main.ts`, `probe.ts`, `run/child.ts`, `run/guidedChild.ts`) |
| Default roots | `/tmp/studio-runner`, `/tmp/studio-runner-objects` | `os.tmpdir()\studio-runner`, `os.tmpdir()\studio-runner-objects` (not `C:\tmp`, which inherits the C:\ ACL). Roots stay short: quarantine paths reach about 300 characters |

Playwright stays **1.63.0** (Chromium rev 1243). On win32 it never detaches browsers and kills them with `taskkill /T /F` [V]. It spawns ffmpeg without `windowsHide`, so a console window may appear (cosmetic, development only) [I].

### Guarantees on Windows

| Guarantee | On Windows | Reason |
|---|---|---|
| No job values in argv or env | Holds | Same code on both hosts |
| Env allowlist and code-loading guard | Holds | Same allowlist with the Windows-required variables added; more code-loading prefixes dropped |
| Chromium sandbox on (`chromiumSandbox: true`) | Holds | It works for a standard user [I]; endpoint security may still crash renderers (W0) |
| Navigation whitelist and IPC validation | Holds | Platform-independent code |
| Tree kill | Holds, stronger than Linux on a runner crash | `taskkill /T /F` plus the libuv kill-on-close job cascade |
| Refusal of symlinks and junctions | Holds | `lstat` reports both as links (`isSymbolicLink`); the W0 preflight checks this for junctions |
| File-id and nlink fences | Holds | dev/ino read as bigint, so NTFS file IDs above 2^53 are not rounded |
| Path confinement | Holds | Native canonical paths, compared case-insensitively |
| Privacy against other non-admin local users | Holds | The protected root ACL, inherited by children |
| Hardened ACL on every root | Partial | `makePrivateRoot` (protected ACL, verified SDDL) covers the recording-scratch root and its namespaces. The scratch, object-store, journal and guided temp roots rely on the per-user ACL they inherit from `%TEMP%`. A root configured outside the user profile is not hardened |
| Non-blocking tree kill | Partial | `taskkill /T /F` runs synchronously, bounded at 1 s, on the kill path. That briefly holds the event loop, which posix avoided for `ps` (AC-11 j) |
| Per-file owner and mode | Does not hold | Windows has no uid or mode bits (uid 0, mode 0o666). Replaced by the root ACL plus inheritance. Same-user attackers and local admins are out of scope, as root is on Linux |
| Atomic no-follow open | Does not hold | `O_NOFOLLOW` does not exist. A link swapped in is detected afterwards by the fence, not prevented (as on macOS) |
| Volume mount-point junctions | Not detected | libuv reports them as plain directories |
| Durable directory entries | Does not hold | Directory fsync gives EPERM, so it is a no-op |
| Descendant proof | Partial | Only the snapshot pids plus the job cascade are covered. Chrome's own job behaviour is [I] |
| Graceful drain on stop | Does not hold | Windows never delivers SIGTERM. Ctrl+C drains; an IDE stop is a hard kill |
| Core-dump suppression | Does not hold | WER LocalDumps is controlled by admins |
| Container controls | Do not hold | No `readOnlyRootFilesystem`, non-root `pwuser`, `/dev/shm` sizing or NetworkPolicy on a laptop |
| Start without a process table | Refuses (fail closed) | If PowerShell or CIM is blocked, the runner does not start |

## Consequences

- **Linux-only.** These stay on Linux and are not run on Windows:
  - the image build;
  - the deployment tier and the perception tier;
  - Helm;
  - `realsite-gate`.

  The component READMEs list them (W7).
- **Verification status: not verified on Windows until a recorded Windows run.** Every Windows behaviour above is [V] from code or source, or [I], until a Windows CI run, or a developer run with logs and the commit SHA, records plan ACs 6–13. Until then the READMEs say "Windows: not verified". The W0 preflight on a bank laptop comes first. It measures CIM latency against the guided 4.5 s close bound; if that latency is too high, the guided teardown design is revisited in W5.
- **Two hosts can drift.** Shared contract tests run against both hosts on fake edges. The win32 pure models (CIM rows, creation-time tree, markers, SDDL/ACE) are unit-tested on every OS. Windows-only and posix-only tests go through `studio-runner/test/helpers/platform.ts` with a stated reason, and a Linux run has 0 platform skips.
- **Local stack.** It starts with `node scripts/dev.mjs` in each component (runner, then backend, then frontend). The bash `dev.sh` files are removed.
- **Open risks.**
  - Endpoint-security DLL injection into Chromium renderers.
  - Defender sharing violations.
  - Zonky needs the VC++ runtime and refuses elevated shells.
  - Long paths.
  - The bank Artifactory may not carry Playwright 1.63.0 or its win64 builds (Chromium rev 1243, ffmpeg, winldd). If it does not, Windows verification runs on a Windows machine outside the bank.

## Alternatives considered

- **Docker or WSL on Windows.** Rejected: neither is available on bank Windows machines.
- **A flag or env switch to pick the host.** Rejected: the platform alone decides (D1), so no configuration can put the win32 checks on Linux or the posix checks on Windows, where they cannot work. D3 then blocks production on win32.
- **Windows in production.** Rejected by the user. The container controls in the table above exist only in the Linux deployment.

— Aria (@architect), 2026-11-05
