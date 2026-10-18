---
name: rel001-repro-harness-gotchas
description: Gotchas running the REL-001 stress harness (repro/): mem floor no-op, swap dips, own_dir subshell leak, asymmetric slow-Chrome via taskpolicy -p, node 23 location, scratch typecheck needs docs symlink
metadata:
  type: reference
---

For `rel001-rootcause01/repro/` (see [[rel001-context-lost-diagnosis]]). Verified 2026-10-17.

- macOS swap is dynamic (total 4096 MB, free ~1.2 GB here). The `mem` mode's hard-coded 1.5 GB free-swap floor makes it hold 0.00 GB (silently a CPU-only run); with a 1.0 GB floor it held 5 GB but free swap fell to 320 MB in about a minute (holder polls while allocating, overshoots) and other apps' pages stayed swapped out afterwards (free swap 496 MB after, from 1.24 GB). Use 3 GB or less, and cpu+mem is gentler than mem alone.
- `run-matrix.sh` leaves `$TMPDIR/rel001.*` behind: `own_dir` runs in `$(...)` so `OWNED_DIRS` stays empty. Remove marked dirs by hand or add `OWNED_DIRS+=("$RUNTMP")`.
- Preflight refuses at 1-min load > 4, including your own previous stress; check `pgrep` for gates yourself and pass `--allow-busy`.
- CPU loops: 11 `yes` on 11 cores starves a `taskpolicy -b` harness completely (launch hangs); 8 loops gives launch p50 ~4 s. Asymmetric slow-Chrome-only mode: `taskpolicy -b -p <pid>` on every descendant of the harness Node pid (polling `ps` at 20 ms); a wrapper executable instead fails PROFILE_MISMATCH (runner compares executable_path with `chromium.executablePath()`).
- tally.mjs classifies PROFILE_MISMATCH as "H1" with PROFILE_PREFERENCES_REQUIRED; read `*.raw.jsonl` to tell them apart. It crashed on a D4-hang record.
- Node 23.10.0 is only at `/opt/homebrew/bin/node` (fnm has 22.23.2, 24.18.1, 24.20.0): `NODE_BIN_DIR=/opt/homebrew/bin REL001_NODE_VERSION=v23.10.0`.
- Scratch `studio-runner` full type-check and some unit tests need `<scratch>/{a,ab}/docs` -> repo `docs` symlink (tests import `../../docs/specs/...json`); remove the symlink afterwards. vitest subset runs need `--coverage.enabled=false`.
- `sleep` of 599 s in the foreground is allowed; zsh treats a leading `=` word (`echo ===`) as command expansion.
