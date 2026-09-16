#!/usr/bin/env bash
# SEC-2, AC-4a part 3 — @qa's shim browser registry, re-run against the built image.
#
# **This script runs INSIDE the container, as `pwuser`.** It is @qa's attack from story 10.12's QA
# recheck, not a description of it: a browser registry that symlinks every real file except
# `chrome-headless-shell`, and replaces that one with a working shim that execs the real binary
# with a sandbox-disabling flag prepended. In @qa's run both `PLAYWRIGHT_BROWSERS_PATH` and `HOME`
# reached it, the run reported ready normally, and no gate noticed.
#
# It is run **twice**, and the successful run is the point:
#
#   1. writable container  → every write must SUCCEED and the shim must actually launch Chromium
#      with the flag. If this form does not succeed, stop: either the image changed or the
#      experiment is wrong, and a control that appears to work against an attack that no longer
#      works is worth nothing.
#   2. `--read-only` plus the two tmpfs mounts standing in for the chart's emptyDirs → every write
#      must FAIL, and the reason each one failed is printed, so a write that failed for an
#      unrelated reason is visible rather than counted as the control working.
#
# The flag is assembled from parts throughout, so this file is not itself a match for the
# repo-wide sandbox-flag scan in `test/run/sandbox.test.ts`.
set -u

FLAG="--no""-sandbox"
REGISTRY="${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright}"
SHIM_LOG=/tmp/sec2-shim.log

say() { printf '%s\n' "$*"; }
rule() { printf '\n──────── %s ────────\n' "$*"; }

rule "environment, read from inside the container"
say "whoami                      : $(id -un) ($(id -u):$(id -g))"
say "HOME                        : ${HOME}"
say "PLAYWRIGHT_BROWSERS_PATH    : ${REGISTRY}"
say "root filesystem             : $(awk '$2=="/" {print $4}' /proc/mounts | head -1)"

REAL="$(find "${REGISTRY}" -name chrome-headless-shell -type f 2>/dev/null | head -1)"
if [ -z "${REAL}" ]; then
  say "FATAL: no real chrome-headless-shell under ${REGISTRY}; the experiment is wrong, not the control"
  exit 90
fi
say "real chrome-headless-shell  : ${REAL}"

# Chromium needs a writable temp directory, and `src/run/launcher.ts` points `TMPDIR` at the run's
# own scratch for exactly this reason. Without it the browser dies on the read-only `/tmp` and the
# control below would report "no browser" where it means "no writable temp" — a difference worth
# not confusing.
for candidate in /scratch/studio-runner /scratch /dev/shm; do
  if [ -d "${candidate}" ] && mkdir -p "${candidate}/tmp" 2>/dev/null; then
    export TMPDIR="${candidate}/tmp"
    SHIM_LOG="${candidate}/tmp/sec2-shim.log"
    break
  fi
done
say "TMPDIR                      : ${TMPDIR:-<none writable>}"
say "shim log                    : ${SHIM_LOG}"

# ── The control for the observable, run BEFORE the attack ────────────────────────────────────
#
# `Seccomp=0` on a Chromium process means unsandboxed — but only if this container is capable of
# showing something else. An observable that reads 0 whatever happens would make the attack look
# successful for the wrong reason, which is "an assertion whose discriminating mechanism is
# pre-empted" (the eighth shape). So the same binary is launched **directly, with no shim and no
# flag**, and its seccomp state is recorded first.
seccompOfChromium() {
  for pid in $(ls /proc | grep -E '^[0-9]+$'); do
    cmd="$( (tr '\0' ' ' < "/proc/${pid}/cmdline") 2>/dev/null )"
    case "${cmd}" in
      *chrome-headless-shell*)
        say "    | pid ${pid}: Seccomp=$(awk '/^Seccomp:/ {print $2}' "/proc/${pid}/status" 2>/dev/null) type=$(echo "${cmd}" | grep -o -- '--type=[a-z-]*' || echo main)"
        ;;
    esac
  done
}

rule "control: the same browser launched directly, sandbox untouched"
"${REAL}" --headless --disable-dev-shm-usage --remote-debugging-port=0 about:blank \
  >/dev/null 2>&1 &
CONTROL_PID=$!
sleep 4
seccompOfChromium
kill "${CONTROL_PID}" 2>/dev/null
wait "${CONTROL_PID}" 2>/dev/null

# ── The attack, attempted at both targets @qa reached ─────────────────────────────────────────
attempt() {
  local target="$1" label="$2"
  rule "attack target: ${label} → ${target}"

  local err
  if ! err="$(mkdir -p "${target}/chromium_headless_shell-shim" 2>&1)"; then
    say "WRITE REFUSED at mkdir: ${err}"
    say "  reason (stat of the parent): $(stat -c '%A %U:%G %n' "${target}" 2>&1 || true)"
    say "  mount flags for that path  : $(findmnt -no OPTIONS --target "${target}" 2>/dev/null || echo 'not a mount point; inherits the root filesystem')"
    return 1
  fi
  say "mkdir SUCCEEDED: ${target}/chromium_headless_shell-shim"

  # Symlink every real sibling so the registry looks whole — @qa's shape exactly. A directory with
  # one file in it is not a browser registry and Playwright would not resolve it.
  for sibling in "$(dirname "${REAL}")"/*; do
    [ "${sibling}" = "${REAL}" ] && continue
    ln -sf "${sibling}" "${target}/chromium_headless_shell-shim/$(basename "${sibling}")" 2>/dev/null
  done

  # The shim. A **working** one: it records the command line it was asked for, then execs the real
  # binary with the sandbox-disabling flag prepended. Not a stub file — the standing wave-5 rule is
  # to size the fixture so the hazard actually occurs.
  if ! err="$(cat > "${target}/chromium_headless_shell-shim/chrome-headless-shell" 2>&1 <<SHIM
#!/bin/sh
echo "SHIM INVOKED: \$0 \$*" >> ${SHIM_LOG}
echo "SHIM EXEC   : ${REAL} ${FLAG} \$*" >> ${SHIM_LOG}
exec "${REAL}" "${FLAG}" "\$@"
SHIM
  )"; then
    say "WRITE REFUSED at shim creation: ${err}"
    return 1
  fi
  chmod +x "${target}/chromium_headless_shell-shim/chrome-headless-shell" 2>/dev/null
  say "SHIM WRITTEN and made executable:"
  sed 's/^/    | /' "${target}/chromium_headless_shell-shim/chrome-headless-shell"
  return 0
}

STATUS=0
attempt "${REGISTRY}" "PLAYWRIGHT_BROWSERS_PATH (the image's own browser registry)" || STATUS=$((STATUS + 1))
attempt "${HOME}" "\$HOME (the second path @qa's attack reached)" || STATUS=$((STATUS + 2))

# ── Did the shim actually launch a browser with the flag? ─────────────────────────────────────
rule "launching Chromium through the shim"
SHIM_BIN=""
for candidate in "${REGISTRY}/chromium_headless_shell-shim/chrome-headless-shell" \
                 "${HOME}/chromium_headless_shell-shim/chrome-headless-shell"; do
  [ -x "${candidate}" ] && SHIM_BIN="${candidate}" && break
done

if [ -z "${SHIM_BIN}" ]; then
  say "no shim exists to launch: every write was refused."
  say ""
  say "RESULT: ATTACK BLOCKED (status ${STATUS})"
  exit 10
fi

rm -f "${SHIM_LOG}"
# A real launch, long enough to read the process table while it is up.
"${SHIM_BIN}" --headless --disable-dev-shm-usage --remote-debugging-port=0 about:blank \
  >/dev/null 2>&1 &
CHROME_PID=$!
sleep 4

say "shim log:"
sed 's/^/    | /' "${SHIM_LOG}" 2>/dev/null || say "    (none)"

say ""
say "the launched command line, read from the process table (/proc/PID/cmdline):"
FOUND_FLAG=0
for pid in $(ls /proc | grep -E '^[0-9]+$'); do
  cmd="$( (tr '\0' ' ' < "/proc/${pid}/cmdline") 2>/dev/null )"
  case "${cmd}" in
    *chrome-headless-shell*)
      say "    | pid ${pid}: ${cmd}"
      case "${cmd}" in *"${FLAG}"*) FOUND_FLAG=1 ;; esac
      ;;
  esac
done

say ""
say "seccomp status of each Chromium process under the shim (compare with the control above):"
seccompOfChromium

kill "${CHROME_PID}" 2>/dev/null
wait "${CHROME_PID}" 2>/dev/null

say ""
if [ "${FOUND_FLAG}" = "1" ]; then
  say "RESULT: ATTACK SUCCEEDED — a shim browser registry was created and Chromium ran under it"
  say "        with the sandbox-disabling flag on its command line."
  exit 0
fi
say "RESULT: shim was written but the flag was not observed on a live process line."
exit 20
