#!/usr/bin/env bash
# Launcher of the stack the ADR-SC-007 release gate runs against (WI-5). See ../README.md and ../../../../docs/qa/evidence/adr-sc-007/wi-5/preflight/gate-env.template.
#
#   gate-stack.sh up        verify the existing runner dist, build the backend jar, start Vault, issuer, Core stand-in, runner, backend; write the manifest
#   gate-stack.sh status    print the manifest and whether its processes are alive
#   gate-stack.sh down      stop what THIS launcher started (runner, backend, issuer, Core stand-in); the Vault container stays unless --vault
#   gate-stack.sh dist-sha  print the sha256 of the current runner dist (read-only), to record after the WI-4 build
#   gate-stack.sh ports     print the resolved port set (read-only)
#
# Side by side with the live dev stack: every port comes from one env-driven set (stack/ports.mjs, CHECKS_GATE_PORT_*),
# defaults 18xxx/14xxx, and the live stack's ports (8080, 8081, 8090, 8092, 5181) are refused. Nothing here binds to,
# stops or signals anything it did not start: `down` signals a pid only if it is the current listener of a GATE port
# (or the issuer process whose command line is this kit's mint-tokens.mjs).
#
# No dist build: WI-4 builds studio-runner/dist once. `up` verifies it read-only (no old resolver, not stale against
# src, `check:pins`, optional CHECKS_GATE_EXPECT_DIST_SHA) and copies it to a frozen directory.
#
# Why not dev.sh: the gate's next-day pass needs the learned tests to survive >= 24 h. dev.sh runs the backend with
# bootRun + DevTools + `gradlew -t classes`, so any sibling Gradle run hot-restarts the JVM and wipes the embedded
# Postgres. Here the backend is an isolated-build JAR (java -jar, no watcher), and the runner runs from the frozen copy.
#
# Everything lives in CHECKS_GATE_STACK_DIR (outside the repo): keys, tokens, journal, jar, frozen runner, logs.
# No secret value is printed. Run it with the Node 24 PATH and JDK 21 (JAVA_HOME_21 or the Homebrew default).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
export PATH="$PATH:/usr/sbin:/sbin:/usr/local/bin"   # lsof lives in /usr/sbin (a restricted PATH would make every port look free), docker in /usr/local/bin

log() { printf '[gate-stack] %s\n' "$*"; }
die() { printf '[gate-stack] ERROR: %s\n' "$*" >&2; exit 1; }
sha() { shasum -a 256 "$1" | cut -d' ' -f1; }
listener() { lsof -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -1 || true; }
command -v lsof >/dev/null || die "lsof is required (port ownership checks)"

# --- the one port set -------------------------------------------------------------------------------------------
PORT_ENV="$(node "$HERE/ports.mjs" env)" || die "invalid port configuration (see above)"
eval "$PORT_ENV"
BACKEND_PORT="$CHECKS_GATE_PORT_BACKEND"; RUNNER_PORT="$CHECKS_GATE_PORT_RUNNER"; CORE_PORT="$CHECKS_GATE_PORT_CORE"
CONNECTOR_PORT="$CHECKS_GATE_PORT_CONNECTOR"; VAULT_PORT="$CHECKS_GATE_PORT_VAULT"; APP_PORT="$CHECKS_GATE_PORT_APP"
GATE_APP_ORIGIN="http://127.0.0.1:${APP_PORT}"

cmd_ports() { echo "$PORT_ENV"; }

# `ports` and `dist-sha` are read-only and need no stack directory.
if [ "${1:-}" != ports ] && [ "${1:-}" != dist-sha ]; then
  : "${CHECKS_GATE_STACK_DIR:?CHECKS_GATE_STACK_DIR is required (a directory outside the worktree)}"
  STACK="$CHECKS_GATE_STACK_DIR"
  case "$STACK" in "$ROOT"/*) die "CHECKS_GATE_STACK_DIR must be outside the worktree" ;; esac
  export CHECKS_GATE_STACK_DIR
  GRADLE_DIR="${CHECKS_GATE_GRADLE_DIR:-$STACK/gradle}"
  case "$GRADLE_DIR" in *spk07-gradle*) die "CHECKS_GATE_GRADLE_DIR must not be another work item's Gradle directory (spk07-gradle)" ;; esac
fi

VAULT_CONTAINER="${CHECKS_GATE_VAULT_CONTAINER:-gate-vault}"
VAULT_IMAGE="${CHECKS_GATE_VAULT_IMAGE:-hashicorp/vault:1.21.4}"
JDK21="${JAVA_HOME_21:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"

dist_sha() { (cd "$1" && find . -type f -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | cut -d' ' -f1); }

cmd_init() {
  umask 077
  mkdir -p "$STACK"/{issuer,tokens,journal} "$GRADLE_DIR" && chmod 700 "$STACK" "$STACK"/{issuer,tokens,journal}
  if [ ! -f "$STACK/issuer/issuer.private.pem" ]; then
    openssl genrsa -out "$STACK/issuer/issuer.private.pem" 2048 2>/dev/null
    openssl rsa -in "$STACK/issuer/issuer.private.pem" -pubout -out "$STACK/issuer/issuer.public.pem" 2>/dev/null
    log "issuer key pair created"
  fi
}

# Read-only verification of the existing runner dist (WI-4 builds it once; this launcher never does).
REHEARSAL=false
verify_dist() {
  local dist="$ROOT/studio-runner/dist"
  [ -d "$dist" ] || die "studio-runner/dist does not exist: WI-4 has not built the runner (this launcher never builds it)"
  if ! node "$HERE/dist-check.mjs" "$ROOT/studio-runner"; then
    # REHEARSAL ONLY: a dist that is merely stale against src may be used, loudly and never as evidence (the manifest records it,
    # and environment validation rejects a rehearsal manifest for an rg- run). The old resolver is never tolerated.
    if [ "${CHECKS_GATE_REHEARSAL:-0}" = 1 ] && ! grep -rlE 'unresolvedRole|locatorHints' "$dist" >/dev/null 2>&1; then
      REHEARSAL=true
      log "REHEARSAL: tolerating a dist that is stale against src (see the list above); this stack is NOT evidence"
    else
      die "the runner dist is stale against src or still holds the old resolver; rebuild it as part of WI-4, then retry"
    fi
  fi
  (cd "$ROOT/studio-runner" && node scripts/check-pins.mjs >/dev/null) || die "the runner's own dist verification (check:pins) failed"
  DIST_SHA="$(dist_sha "$dist")"
  if [ -n "${CHECKS_GATE_EXPECT_DIST_SHA:-}" ] && [ "$CHECKS_GATE_EXPECT_DIST_SHA" != "$DIST_SHA" ]; then
    die "the runner dist sha256 ($DIST_SHA) differs from CHECKS_GATE_EXPECT_DIST_SHA: the dist changed after WI-4 recorded it"
  fi
  log "runner dist verified read-only (sha256 $DIST_SHA)"
}

cmd_up() {
  cmd_init
  : "${STUDIO_GATEWAY_PROJECT:?STUDIO_GATEWAY_PROJECT is required}"
  : "${STUDIO_GATEWAY_LOCATION:?STUDIO_GATEWAY_LOCATION is required}"
  : "${STUDIO_GATEWAY_ENDPOINT:?STUDIO_GATEWAY_ENDPOINT is required (the recorder, e.g. http://127.0.0.1:${CHECKS_GATE_PORT_RECORDER})}"
  # Fail fast, before anything is started or built: every port the stack will bind must be free.
  # Our own Vault container may already be up from a previous `up` (down keeps it): then its port is expected to be busy,
  # provided it publishes exactly the gate Vault port. Any other holder of the port is refused.
  CHECK_PORTS="backend core runner connector app"
  if docker ps --format '{{.Names}}' | grep -qx "$VAULT_CONTAINER"; then
    docker port "$VAULT_CONTAINER" 8200/tcp 2>/dev/null | grep -q "127.0.0.1:${VAULT_PORT}$" || die "the container $VAULT_CONTAINER is up but does not publish 127.0.0.1:${VAULT_PORT}; remove it (gate-stack.sh down --vault)"
  else
    CHECK_PORTS="$CHECK_PORTS vault"
  fi
  # shellcheck disable=SC2086
  node "$HERE/ports.mjs" check $CHECK_PORTS || die "a gate port is already listening"
  export STUDIO_GATEWAY_PROVIDER=vertex
  export STUDIO_GATEWAY_MODEL="${STUDIO_GATEWAY_MODEL:-gemini-3.8-flash}"
  export STUDIO_GATEWAY_CREDENTIALS_MODE="${STUDIO_GATEWAY_CREDENTIALS_MODE:-application-default}"
  UPSTREAM="${CHECKS_GATE_UPSTREAM_ENDPOINT:-https://aiplatform.googleapis.com}"

  # 1. the existing runner dist, verified read-only, then a frozen copy
  verify_dist
  rm -rf "$STACK/runner-frozen" && mkdir -p "$STACK/runner-frozen"
  cp -R "$ROOT/studio-runner/dist" "$ROOT/studio-runner/package.json" "$ROOT/studio-runner/node_modules" "$ROOT/studio-runner/scripts" "$STACK/runner-frozen/"

  # 2. catalog + overlays (public values), against the frozen dist; fails fast if a port is taken
  CHECKS_GATE_RUNNER_DIR="$STACK/runner-frozen" node "$HERE/gen-config.mjs" >/dev/null

  # 3. token issuer and the Core session stand-in (cookie put_session=local-dev-session), on gate ports only
  if [ ! -f "$STACK/issuer.pid" ] || ! kill -0 "$(cat "$STACK/issuer.pid")" 2>/dev/null; then
    nohup node "$HERE/mint-tokens.mjs" serve >"$STACK/issuer.log" 2>&1 &
    echo $! >"$STACK/issuer.pid"
  fi
  nohup node "$HERE/local-core.mjs" >"$STACK/local-core.log" 2>&1 &
  echo $! >"$STACK/core.pid"
  for _ in $(seq 1 20); do [ -n "$(listener "$CORE_PORT")" ] && break; sleep 0.5; done
  [ -n "$(listener "$CORE_PORT")" ] || die "the Core stand-in did not start (log: $STACK/local-core.log)"

  # 4. backend jar in an isolated build directory (its own Gradle dirs; never another work item's)
  log "building the backend jar (isolated build dir $GRADLE_DIR)"
  cat >"$GRADLE_DIR/build-init.gradle" <<EOF
allprojects { if (name == "checks-backend") { layout.buildDirectory.set(file("$GRADLE_DIR/build")) } }
EOF
  (cd "$ROOT/backend" && JAVA_HOME="$JDK21" ./gradlew -I "$GRADLE_DIR/build-init.gradle" --project-cache-dir "$GRADLE_DIR/project-cache" --offline -x verifyRunnerDist bootJar -x test --console=plain -q)
  JAR="$(ls "$GRADLE_DIR"/build/libs/*.jar | grep -v -- '-plain' | head -1)"
  [ -n "$JAR" ] || die "bootJar produced no jar"
  cp "$JAR" "$STACK/backend.jar"
  JAR_SHA="$(sha "$STACK/backend.jar")"

  # 5. Vault (dev mode, in memory, loopback only, gate port)
  if ! docker ps --format '{{.Names}}' | grep -qx "$VAULT_CONTAINER"; then
    docker rm -f "$VAULT_CONTAINER" >/dev/null 2>&1 || true   # only our own container name
    openssl rand -hex 16 >"$STACK/vault.token"
    docker run -d --name "$VAULT_CONTAINER" -p "127.0.0.1:${VAULT_PORT}:8200" -e "VAULT_DEV_ROOT_TOKEN_ID=$(cat "$STACK/vault.token")" "$VAULT_IMAGE" >/dev/null
  fi
  for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:${VAULT_PORT}/v1/sys/health" >/dev/null && break; sleep 1; done
  curl -sf "http://127.0.0.1:${VAULT_PORT}/v1/sys/health" >/dev/null || die "Vault did not become healthy on :${VAULT_PORT}"

  # 6. runner (mutual TLS, from the frozen copy, on the gate port)
  WORK="$(mktemp -d "${TMPDIR:-/tmp}/put-checks-studio-runner.XXXXXX")"
  export STUDIO_RUNNER_SERVICE_TOKEN="${STUDIO_RUNNER_SERVICE_TOKEN:-$(openssl rand -hex 32)}"
  export STUDIO_CALLBACK_SERVICE_TOKEN="${STUDIO_CALLBACK_SERVICE_TOKEN:-$(openssl rand -hex 32)}"
  DEV_BACKEND_PORT="$BACKEND_PORT" DEV_STUDIO_RUNNER_PORT="$RUNNER_PORT" node "$ROOT/tools/studio-local-tls.mjs" prepare "$WORK"
  # shellcheck disable=SC1091
  source "$WORK/tls-environment.sh"
  export STUDIO_RUNNER_BASE_URL="https://127.0.0.1:${RUNNER_PORT}"
  export STUDIO_EVIDENCE_PROVIDER=local STUDIO_EVIDENCE_DIRECTORY="$WORK/objects"
  mkdir -p "$WORK/objects"
  node -e '
    const fs=require("fs"),[,d,w]=process.argv;
    const f=w+"/runner-environment.json",e=JSON.parse(fs.readFileSync(f,"utf8"));
    Object.assign(e,JSON.parse(fs.readFileSync(d+"/runner-extra.json","utf8")));
    fs.writeFileSync(f,JSON.stringify(e),{mode:0o600});' "$STACK" "$WORK"
  (cd "$STACK/runner-frozen" && exec env -i PATH="$PATH" HOME="$HOME" node "$ROOT/tools/studio-local-tls.mjs" run "$WORK" >"$WORK/studio-runner.log" 2>&1) &
  RUNNER_PID=$!
  for _ in $(seq 1 40); do node "$ROOT/tools/studio-local-tls.mjs" health "$WORK" >/dev/null 2>&1 && break; kill -0 "$RUNNER_PID" 2>/dev/null || die "the runner exited during startup (log: $WORK/studio-runner.log)"; sleep 1; done
  node "$ROOT/tools/studio-local-tls.mjs" health "$WORK" >/dev/null 2>&1 || die "the runner did not pass mutual-TLS readiness"

  # 7. backend from the jar (profile local+dev: embedded Postgres, 3 seeded CSIs incl. 178672), on the gate port
  export SPRING_CONFIG_ADDITIONAL_LOCATION="file:$STACK/backend-guided.yml"
  export CHECKS_SOURCE_UI_TEST=true
  export CHECKS_CORE_SERVICE_URL="http://127.0.0.1:${CORE_PORT}"
  export STUDIO_VAULT_PROVIDER=hashicorp STUDIO_VAULT_ADDRESS="http://127.0.0.1:${VAULT_PORT}" STUDIO_VAULT_TOKEN_FILE="$STACK/vault.token"
  export CHECKS_CORS_ALLOWED_ORIGINS="${GATE_APP_ORIGIN}"
  JAVA_HOME="$JDK21" nohup "$JDK21/bin/java" -jar "$STACK/backend.jar" --spring.profiles.active=local,dev --server.port="$BACKEND_PORT" >"$STACK/backend.log" 2>&1 &
  BACKEND_PID=$!
  for _ in $(seq 1 90); do curl -sf "http://127.0.0.1:${BACKEND_PORT}/actuator/info" >/dev/null && break; kill -0 "$BACKEND_PID" 2>/dev/null || die "the backend exited during startup (log: $STACK/backend.log)"; sleep 2; done
  curl -sf "http://127.0.0.1:${BACKEND_PORT}/actuator/info" >/dev/null || die "the backend did not become healthy"
  PG_PORT="$(grep -o 'Zonky embedded PostgreSQL started on port [0-9]*' "$STACK/backend.log" | tail -1 | grep -o '[0-9]*$')"
  [ -n "$PG_PORT" ] || die "could not read the embedded Postgres port from the backend log"

  # 8. manifest (non-secret)
  node - "$STACK" "$ROOT" "$JAR_SHA" "$DIST_SHA" "$WORK" "$RUNNER_PORT" "$BACKEND_PORT" "$PG_PORT" "$UPSTREAM" "$VAULT_CONTAINER" "$PORT_ENV" "$REHEARSAL" <<'NODE'
const fs = require('fs'), cp = require('child_process'), crypto = require('crypto');
const [, , stack, root, jarSha, distSha, work, runnerPort, backendPort, pgPort, upstream, vault, portEnv, rehearsal] = process.argv;
const pid = (port) => Number(cp.execFileSync('/usr/sbin/lsof', ['-tiTCP:' + port, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim().split('\n')[0]);
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const env = process.env;
const ports = Object.fromEntries(portEnv.split('\n').map((l) => l.replace('export CHECKS_GATE_PORT_', '').split('=')).map(([k, v]) => [k.toLowerCase(), Number(v)]));
const manifest = {
  backend: { pid: pid(backendPort), jarPath: stack + '/backend.jar', jarSha256: jarSha, port: Number(backendPort) },
  runner: { pid: pid(runnerPort), frozenDir: stack + '/runner-frozen', distSha256: distSha, logPath: work + '/studio-runner.log', workDir: work, journalDir: stack + '/journal', port: Number(runnerPort) },
  gateway: {
    provider: env.STUDIO_GATEWAY_PROVIDER, model: env.STUDIO_GATEWAY_MODEL, project: env.STUDIO_GATEWAY_PROJECT, location: env.STUDIO_GATEWAY_LOCATION,
    endpoint: env.STUDIO_GATEWAY_ENDPOINT, upstreamEndpoint: upstream, credentialsMode: env.STUDIO_GATEWAY_CREDENTIALS_MODE,
    allowAllDomains: true, vaultProvider: env.STUDIO_VAULT_PROVIDER, runnerGuidedCapacity: 1,
    applicationYmlSha256: sha(root + '/backend/src/main/resources/application.yml'), overlaySha256: sha(stack + '/backend-guided.yml'),
  },
  ports,
  logs: { backend: stack + '/backend.log', core: stack + '/local-core.log', issuer: stack + '/issuer.log' },
  vault: { container: vault },
  postgresPort: Number(pgPort),
  startedAt: new Date().toISOString(),
  ...(rehearsal === 'true' ? { rehearsal: true } : {}),
};
fs.writeFileSync(stack + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
console.log('manifest written: ' + stack + '/manifest.json');
NODE
  log "stack is up (gate ports only). Export:"
  log "  CHECKS_GATE_STACK_MANIFEST=$STACK/manifest.json CHECKS_GATE_PGPORT=$PG_PORT CHECKS_E2E_BACKEND_URL=http://127.0.0.1:${BACKEND_PORT} CHECKS_E2E_APP_PORT=${APP_PORT}"
}

cmd_status() {
  [ -f "$STACK/manifest.json" ] || die "no manifest in $STACK"
  node -e '
    const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    const alive=(p)=>{try{process.kill(p,0);return true}catch{return false}};
    console.log(JSON.stringify({backendAlive:alive(m.backend.pid),runnerAlive:alive(m.runner.pid),startedAt:m.startedAt,ports:m.ports,postgresPort:m.postgresPort,jarSha256:m.backend.jarSha256,distSha256:m.runner.distSha256},null,2));' "$STACK/manifest.json"
}

# Signals a pid only when it is the current listener of the given GATE port.
stop_listener() {
  local pid="$1" port="$2" label="$3"
  [ -n "$pid" ] || return 0
  if [ "$(listener "$port")" = "$pid" ]; then kill -TERM "$pid" 2>/dev/null || true; log "stopped $label (pid $pid, gate port $port)"
  else log "not signalling $label: pid $pid is not the listener of gate port $port"; fi
}

cmd_down() {
  local vault_flag="${1:-}"   # `set --` below overwrites the positional parameters
  if [ -f "$STACK/manifest.json" ]; then
    local ids
    ids="$(node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(m.runner.pid+" "+m.runner.port+" "+m.backend.pid+" "+m.backend.port)' "$STACK/manifest.json")"
    # shellcheck disable=SC2086
    set -- $ids
    case "$2" in "$RUNNER_PORT") stop_listener "$1" "$2" "runner" ;; *) log "manifest runner port $2 is not this configuration's gate port; not signalling" ;; esac
    case "$4" in "$BACKEND_PORT") stop_listener "$3" "$4" "backend" ;; *) log "manifest backend port $4 is not this configuration's gate port; not signalling" ;; esac
  fi
  [ -f "$STACK/core.pid" ] && stop_listener "$(cat "$STACK/core.pid")" "$CORE_PORT" "Core stand-in"
  if [ -f "$STACK/issuer.pid" ]; then
    local ipid; ipid="$(cat "$STACK/issuer.pid")"
    if ps -o command= -p "$ipid" 2>/dev/null | grep -qF "$HERE/mint-tokens.mjs"; then kill -TERM "$ipid" 2>/dev/null || true; log "stopped the token issuer (pid $ipid)"; fi
  fi
  if [ "$vault_flag" = "--vault" ]; then docker rm -f "$VAULT_CONTAINER" >/dev/null 2>&1 || true; fi
  log "done (the Vault container $VAULT_CONTAINER is kept unless --vault)"
}

case "${1:-}" in
  init) cmd_init ;;
  up) cmd_up ;;
  status) cmd_status ;;
  down) shift; cmd_down "${1:-}" ;;
  dist-sha) dist_sha "$ROOT/studio-runner/dist" ;;
  ports) cmd_ports ;;
  *) echo "usage: gate-stack.sh <init|up|status|down [--vault]|dist-sha|ports>" >&2; exit 2 ;;
esac
