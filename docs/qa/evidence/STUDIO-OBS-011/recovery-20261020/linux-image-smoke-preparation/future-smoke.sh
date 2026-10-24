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
NODE_PID=$(docker exec "$PFX-init" ps -A -o pid=,args= | awk '$2=="node" && $3=="dist/main.js" {print $1;exit}')
docker exec "$PFX-init" node /smoke/fixture.mjs inspect "$NODE_PID" > "$OUT/active.json"
# Complete exactly one no-init and one debug negative; capture only closed classification.
for kind in noinit debug; do
  extra=(); expected='CONFIGURATION_DENIED LAUNCH_TREE'
  if [[ "$kind" == debug ]]; then extra=(--init -e NODE_OPTIONS=--max-old-space-size=1024); expected='CONFIGURATION_DENIED DEBUG_ENV'; fi
  if docker run --name "$PFX-$kind" "${extra[@]}" "${COMMON[@]}" "$IMAGE" > "$TMP/$kind.stdout" 2> "$TMP/$kind.stderr"; then code=0; else code=$?; fi
  exact=false; [[ "$(cat "$TMP/$kind.stderr")" == "$expected" ]] && exact=true
  started=false; if grep -q 'runner.started' "$TMP/$kind.stdout"; then started=true; fi
  printf '{"exit":%s,"exactExpectedRefusal":%s,"runnerStarted":%s}\n' "$code" "$exact" "$started" > "$OUT/$kind.json"
  [[ "$code" == 78 && "$exact" == true && "$started" == false ]] || exit 1
done
START=$SECONDS
docker stop -t 30 "$PFX-init" >/dev/null
ELAPSED=$((SECONDS-START))
[[ "$ELAPSED" -lt 30 && "$(docker inspect --format '{{.State.ExitCode}}' "$PFX-init")" == 0 ]] || exit 1
docker logs "$PFX-init" > "$TMP/main.log" 2>/dev/null
"$N24" --input-type=module - "$TMP/main.log" "$ELAPSED" > "$OUT/drain.json" <<'JS'
import {readFileSync} from 'node:fs';
const events=readFileSync(process.argv[2],'utf8').split('\n').flatMap(line=>{try{const e=JSON.parse(line);return ['runner.started','runner.draining','runner.drained'].includes(e.event)?[{event:e.event,...(typeof e.guidedClosed==='boolean'?{guidedClosed:e.guidedClosed}:{})}]:[];}catch{return [];}});
const a=events.findIndex(e=>e.event==='runner.draining'),b=events.findIndex(e=>e.event==='runner.drained');
if(a<0||b<=a||events[b].guidedClosed!==true)process.exit(1);
console.log(JSON.stringify({events,stopSeconds:Number(process.argv[3]),exit:0}));
JS
docker logs "$PFX-controller" > "$OUT/fixture-events.jsonl" 2>/dev/null
grep -q '"event":"D2_RECORDING_STORED"' "$OUT/fixture-events.jsonl"
! grep -qE 'D2_FIXTURE_FAILED|D2_FIXTURE_REJECTED' "$OUT/fixture-events.jsonl"
docker exec "$PFX-controller" node /smoke/fixture.mjs inspect-after > "$OUT/after.json"
docker stop -t 5 "$PFX-controller" >/dev/null
[[ "$(docker inspect --format '{{.State.ExitCode}}' "$PFX-controller")" == 0 ]] || exit 1
docker logs "$PFX-controller" > "$OUT/fixture-events.jsonl" 2>/dev/null
docker image inspect --format "$FORMAT" "$IMAGE" > "$OUT/image-after.txt"
cmp "$OUT/image-before.txt" "$OUT/image-after.txt"
printf '{"allSevenD2StepsObserved":true,"productionCredit":false,"retryCount":0}\n' > "$OUT/result.json"
