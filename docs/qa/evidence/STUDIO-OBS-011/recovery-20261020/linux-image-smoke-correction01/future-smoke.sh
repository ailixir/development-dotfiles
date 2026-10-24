#!/bin/bash
# UNEXECUTED future command, reviewed binding+root GO required. No build/pull/retag or tier rerun.
set -euo pipefail
IMAGE=${1:?immutable measured final image sha256 required}
PFX=${2:?fresh resource prefix required}
OUT=${3:?fresh evidence output directory required}
[[ "$IMAGE" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 2
case "$PFX" in obs011-d2-final-*) ;; *) exit 2;; esac
[[ ! -e "$OUT" ]] || exit 2
PACKET=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$PACKET/../../../../../.." && pwd)
N24=/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin/node
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
TMP=$(mktemp -d /private/tmp/obs011-d2-final.XXXXXX)
TLS="$PFX-tls"; TMPVOL="$PFX-tmp"; JNL="$PFX-journal"
names=("$PFX-prep" "$PFX-identity" "$PFX-init" "$PFX-noinit" "$PFX-debug" "$PFX-controller")
volumes=("$TLS" "$TMPVOL" "$JNL")
# Freshness checks are refusals, not permission to remove an old run's resources.
for name in "${names[@]}"; do if docker container inspect "$name" >/dev/null 2>&1; then exit 2; fi; done
for name in "${volumes[@]}"; do if docker volume inspect "$name" >/dev/null 2>&1; then exit 2; fi; done
cleanup() {
  rc=$?; trap - EXIT
  for name in "${names[@]}"; do docker rm -f "$name" >/dev/null 2>&1 || true; done
  for name in "${volumes[@]}"; do docker volume rm "$name" >/dev/null 2>&1 || true; done
  rm -rf "$TMP"
  left=0
  for name in "${names[@]}"; do if docker container inspect "$name" >/dev/null 2>&1; then left=$((left+1)); fi; done
  for name in "${volumes[@]}"; do if docker volume inspect "$name" >/dev/null 2>&1; then left=$((left+1)); fi; done
  printf '{"commandExit":%s,"ownedResourcesRemaining":%s}\n' "$rc" "$left" > "$OUT/cleanup.json"
  [[ "$left" == 0 ]] || rc=1
  exit "$rc"
}
trap cleanup EXIT
FORMAT='{"Id":{{json .Id}},"Os":{{json .Os}},"Cmd":{{json .Config.Cmd}},"Entrypoint":{{json .Config.Entrypoint}},"User":{{json .Config.User}}}'
docker image inspect --format "$FORMAT" "$IMAGE" > "$OUT/image-before.txt"
"$N24" --input-type=module - "$OUT/image-before.txt" "$IMAGE" <<'JS'
import {readFileSync} from 'node:fs';
const image=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(image.Id!==process.argv[3]||image.Os!=='linux'||image.User!=='pwuser'||JSON.stringify(image.Cmd)!==JSON.stringify(['sh','-c','ulimit -c 0 && exec node dist/main.js'])||(image.Entrypoint!==null&&image.Entrypoint.length!==0))process.exit(1);
JS
docker run --rm --network none --name "$PFX-identity" --entrypoint id "$IMAGE" > "$OUT/pwuser.txt"
[[ "$(cat "$OUT/pwuser.txt")" == uid=1001\(pwuser\)\ gid=1001\(pwuser\)* ]] || exit 1
"$N24" "$PACKET/fixture.mjs" prepare "$TMP" "$REPO/studio-runner/test/fixtures/guided-tls"
# Only this throwaway setup container is root; all main/controller image runs retain pwuser.
for name in "${volumes[@]}"; do docker volume create "$name" >/dev/null; done
docker create --network none --name "$PFX-prep" --user 0 --entrypoint sh -v "$TLS:/tls" -v "$TMPVOL:/tmp" -v "$JNL:/journal" "$IMAGE" -c 'chown 0:1001 /tls /tls/*; chmod 0555 /tls; chmod 0440 /tls/*; chmod 1777 /tmp; chown 1001:1001 /journal; chmod 0700 /journal' >/dev/null
# Do not place the env file in the TLS volume (and never print it).
mkdir "$TMP/material"
for name in tls.key tls.crt ca.crt controller-public.pem callback.token; do cp "$TMP/$name" "$TMP/material/$name"; done
docker cp "$TMP/material/." "$PFX-prep:/tls/"
docker start -a "$PFX-prep" >/dev/null
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$PFX-prep")" == 0 ]] || exit 1
docker rm "$PFX-prep" >/dev/null
COMMON=(--network none --read-only --shm-size=512m -v "$TMPVOL:/tmp" -v "$JNL:/journal" -v "$TLS:/tls:ro" --env-file "$TMP/env" --mount "type=bind,source=$PACKET/fixture.mjs,target=/smoke/fixture.mjs,readonly")
# D2-QA-02: same two startup negatives, detached so a missing guard cannot hold this shell.
# D2-QA-01: finish both before the positive container/context exists.
for kind in noinit debug; do
  extra=(); expected='CONFIGURATION_DENIED LAUNCH_TREE'
  if [[ "$kind" == debug ]]; then extra=(--init -e NODE_OPTIONS=--max-old-space-size=1024); expected='CONFIGURATION_DENIED DEBUG_ENV'; fi
  docker run -d --name "$PFX-$kind" "${extra[@]}" "${COMMON[@]}" "$IMAGE" > "$OUT/$kind.id"
  ended=0
  for ((i=0;i<90;i++)); do
    if [[ "$(docker inspect --format '{{.State.Running}}' "$PFX-$kind")" == false ]]; then ended=1; break; fi
    sleep 1
  done
  if [[ "$ended" != 1 ]]; then
    printf '{"exit":null,"missedRefusalDeadline":true,"pollBoundSeconds":90}\n' > "$OUT/$kind.json"
    exit 1 # EXIT cleanup removes only the exact owned running container; never retry/pass.
  fi
  code=$(docker inspect --format '{{.State.ExitCode}}' "$PFX-$kind")
  docker logs "$PFX-$kind" > "$TMP/$kind.stdout" 2> "$TMP/$kind.stderr"
  exact=false; [[ "$(cat "$TMP/$kind.stderr")" == "$expected" ]] && exact=true
  started=false; if grep -q 'runner.started' "$TMP/$kind.stdout"; then started=true; fi
  printf '{"exit":%s,"missedRefusalDeadline":false,"pollBoundSeconds":90,"exactExpectedRefusal":%s,"runnerStarted":%s}\n' "$code" "$exact" "$started" > "$OUT/$kind.json"
  [[ "$code" == 78 && "$exact" == true && "$started" == false ]] || exit 1
done
docker run -d --init --name "$PFX-init" "${COMMON[@]}" "$IMAGE" > "$OUT/positive.id"
ready=0
for ((i=0;i<90;i++)); do
  if docker exec "$PFX-init" node dist/probe.js /health >/dev/null 2>&1; then ready=1; break; fi
  [[ "$(docker inspect --format '{{.State.Running}}' "$PFX-init")" == true ]] || break
  sleep 1
done
[[ "$ready" == 1 ]] || exit 1
# Same isolated loopback namespace; no published host port, bridge or external service.
docker run -d --name "$PFX-controller" --network "container:$PFX-init" --read-only -v "$TLS:/tls:ro" -v "$TMPVOL:/runner-tmp:ro" --mount "type=bind,source=$PACKET/fixture.mjs,target=/smoke/fixture.mjs,readonly" --entrypoint node "$IMAGE" /smoke/fixture.mjs serve > "$OUT/controller.id"
ready=0
for ((i=0;i<90;i++)); do
  if docker logs "$PFX-controller" 2>/dev/null | grep -q '"event":"D2_READY_FOR_STOP"'; then ready=1; break; fi
  [[ "$(docker inspect --format '{{.State.Running}}' "$PFX-controller")" == true ]] || break
  sleep 1
done
[[ "$ready" == 1 ]] || exit 1
# Reject any historical settlement before the last active-resource inspection.
docker logs "$PFX-controller" > "$OUT/pre-stop-fixture-events.jsonl" 2>/dev/null
if grep -qE 'D2_LIFECYCLE|D2_RECORDING_STORED|D2_FIXTURE_FAILED|D2_FIXTURE_REJECTED|D2_ADAPTER_ERROR' "$OUT/pre-stop-fixture-events.jsonl"; then exit 1; fi
NODE_PID=$(docker exec "$PFX-init" ps -A -o pid=,args= | awk '$2=="node" && $3=="dist/main.js" {print $1;exit}')
docker exec "$PFX-init" node /smoke/fixture.mjs inspect "$NODE_PID" > "$OUT/active.json"
# No intervening negative/setup work after this fresh owned-browser/allocation snapshot.
START=$SECONDS
docker stop -t 30 "$PFX-init" >/dev/null
ELAPSED=$((SECONDS-START))
[[ "$ELAPSED" -lt 30 && "$(docker inspect --format '{{.State.ExitCode}}' "$PFX-init")" == 0 ]] || exit 1
docker logs "$PFX-init" > "$TMP/main.log" 2>/dev/null
docker logs "$PFX-controller" > "$OUT/fixture-events.jsonl" 2>/dev/null
"$N24" --input-type=module - "$TMP/main.log" "$ELAPSED" "$OUT/fixture-events.jsonl" "$OUT/active.json" > "$OUT/drain.json" <<'JS'
import {readFileSync} from 'node:fs';
const events=readFileSync(process.argv[2],'utf8').split('\n').flatMap(line=>{try{const e=JSON.parse(line);return ['runner.started','runner.draining','runner.drained'].includes(e.event)?[{event:e.event,atMs:Date.parse(e.ts),...(typeof e.guidedClosed==='boolean'?{guidedClosed:e.guidedClosed}:{})}]:[];}catch{return [];}});
const a=events.findIndex(e=>e.event==='runner.draining'),b=events.findIndex(e=>e.event==='runner.drained');
if(a<0||b<=a||events[b].guidedClosed!==true)process.exit(1);
const fixture=readFileSync(process.argv[4],'utf8').trim().split('\n').map(line=>JSON.parse(line));
const active=JSON.parse(readFileSync(process.argv[5],'utf8'));
const ready=fixture.filter(e=>e.event==='D2_READY_FOR_STOP'),lifecycle=fixture.filter(e=>e.event==='D2_LIFECYCLE'),recording=fixture.filter(e=>e.event==='D2_RECORDING_STORED');
const boundary=events[a].atMs;
if(!Number.isSafeInteger(boundary)||ready.length!==1||lifecycle.length!==1||recording.length!==1||active.liveOwnedBrowserLeaders!==1||active.activeRecordingDirectories!==1||active.observedAtMs>boundary||ready[0].expiresAtMs<=boundary||lifecycle[0].reason!=='CONTEXT_LOST'||lifecycle[0].receivedAtMs<=boundary||recording[0].receivedAtMs<=boundary||fixture.some(e=>['D2_FIXTURE_FAILED','D2_FIXTURE_REJECTED','D2_ADAPTER_ERROR'].includes(e.event)))process.exit(1);
console.log(JSON.stringify({events,stopSeconds:Number(process.argv[3]),exit:0,activeObservedAtMs:active.observedAtMs,liveOwnedBrowserLeaders:active.liveOwnedBrowserLeaders,lifecycleReceivedAtMs:lifecycle[0].receivedAtMs,lifecycleReason:lifecycle[0].reason,recordingReceivedAtMs:recording[0].receivedAtMs,settlementAfterActualDraining:true}));
JS
docker logs "$PFX-controller" > "$OUT/fixture-events.jsonl" 2>/dev/null
grep -q '"event":"D2_RECORDING_STORED"' "$OUT/fixture-events.jsonl"
if grep -qE 'D2_FIXTURE_FAILED|D2_FIXTURE_REJECTED|D2_ADAPTER_ERROR' "$OUT/fixture-events.jsonl"; then exit 1; fi
docker exec "$PFX-controller" node /smoke/fixture.mjs inspect-after > "$OUT/after.json"
docker stop -t 5 "$PFX-controller" >/dev/null
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$PFX-controller")" == 0 ]] || exit 1
docker logs "$PFX-controller" > "$OUT/fixture-events.jsonl" 2>/dev/null
docker image inspect --format "$FORMAT" "$IMAGE" > "$OUT/image-after.txt"
cmp "$OUT/image-before.txt" "$OUT/image-after.txt"
printf '{"allSevenD2StepsObserved":true,"productionCredit":false,"retryCount":0}\n' > "$OUT/result.json"
