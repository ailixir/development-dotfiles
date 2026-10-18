#!/bin/zsh
# STUDIO-OBS-009 G9 image add-on (root; run ONLY after C8 has ended).
# U22 (user-authorized): local docker build of studio-runner/ with fresh tags, C4 re-run against it
# (C4b), and the D2 image smoke. No image pulls (BuildKit fetching the Dockerfile syntax frontend is
# the one allowed network read). Every docker command is scoped to the tags and names below.
# Evidence: docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018/image/ ; status lines append to ../status.txt.
set -u
ROOT=/Users/brunobuger/orca/workspaces/put-checks/ui-studio
G=$ROOT/docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018
O=$G/image
SMK=$O/smoke
X9=$ROOT/.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009
CAP=$ROOT/.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py
N24=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin
REPO=put-checks-studio-runner                      # image.ts default repo; 015 runbook uses the same repo
TAG=$REPO:obs009-g9-local
BTAG=$REPO:obs009-g9-buildstage-local
EXEC_RES=$ROOT/docs/qa/evidence/STUDIO-OBS-009/execution-20261018/execution/obs009-g9-runner-deploy02-results.json
PFX=obs009-g9-smoke
TLSVOL=$PFX-tls
SMOKE_NAMES=($PFX-id $PFX-tlsprep $PFX-tlsfix $PFX-init $PFX-noinit $PFX-nodeopts)
T=""
STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)

die() { print -u2 -- "G9-IMAGE REFUSED: $*"; exit 2 }
say() { print -r -- "$*" | tee -a $O/run.log }
st()  { print -r -- "$1 exit=$2" | tee -a $G/status.txt | tee -a $O/image-status.txt }

# ---------------------------------------------------------------- 1. gate (writes nothing on refusal)
cd $ROOT || die "cannot cd to $ROOT"
[[ -f $G/status.txt ]] || die "$G/status.txt does not exist"
grep -q '^C8-backend ' $G/status.txt || die "status.txt has no 'C8-backend' line: the G9 backend check has not ended"
if pgrep -fl obs009-g9-check01 >/dev/null 2>&1; then
  die "an obs009-g9-check01 process is still running (C8 not finished): $(pgrep -fl obs009-g9-check01 | head -3)"
fi
[[ -f $G/capture-before.json ]] || die "$G/capture-before.json (G9 reference digests) is missing"
[[ ! -e $O/summary.json ]] || die "$O/summary.json exists: this script already ran. Move $O aside deliberately before a re-run."
command -v docker >/dev/null 2>&1 || die "docker not on PATH"
docker version --format '{{.Server.Version}}' >/dev/null 2>&1 || die "docker daemon not reachable"

# Base image must already be cached: pulls are NOT authorized. Read-only inspect, ref derived from the Dockerfile ARG defaults.
arg() { sed -n "s/^ARG $1=\(.*\)\$/\1/p" $ROOT/studio-runner/Dockerfile | head -1 }
BASE=$(arg REGISTRY)/playwright:v$(arg PLAYWRIGHT_VERSION)-$(arg PLAYWRIGHT_DISTRO)
docker image inspect $BASE >/dev/null 2>&1 || die "base image $BASE is not cached locally; the build would need a pull and pulls are not authorized"

mkdir -p $O $SMK || die "cannot create $O"
: > $O/run.log
say "G9-IMAGE start $STARTED  base=$BASE (cached)  tag=$TAG  buildstage=$BTAG"
export PATH=$N24:$PATH
export F_started=$STARTED F_base=$BASE F_tag=$TAG F_btag=$BTAG
F_docker_server=$(docker version --format '{{.Server.Version}}' 2>/dev/null); export F_docker_server
F_base_id=$(docker image inspect --format '{{.Id}}' $BASE 2>/dev/null); export F_base_id

finish() {   # finish <verdict> <exit>
  export F_verdict=$1
  F_ended=$(date -u +%Y-%m-%dT%H:%M:%SZ); export F_ended
  python3 - $O $G $EXEC_RES <<'PY'
import json, os, sys, pathlib
O, G, execres = map(pathlib.Path, sys.argv[1:4])
F = {k[2:]: v for k, v in os.environ.items() if k.startswith('F_')}
def rd(p, n=12):
    p = pathlib.Path(p)
    if not p.is_file(): return None
    return [l[:300] for l in p.read_text(errors='replace').splitlines()[:n]]
def js(p):
    try: return json.loads(pathlib.Path(p).read_text())
    except Exception: return None
s = {'script': 'g9-image.sh', 'verdict': F.get('verdict'), 'facts': F}
cb, ca, g9 = js(O/'capture-before.json'), js(O/'capture-after.json'), js(G/'capture-before.json')
def dg(c): return None if not c else {'source': c.get('digest'), 'dist': (c.get('dist') or {}).get('digest'), 'head': c.get('head')}
s['capture'] = {'g9Before': dg(g9), 'imageBefore': dg(cb), 'imageAfter': dg(ca)}
r = js(execres)
if r:
    s['c4b'] = {k: r.get(k) for k in ('exit', 'sourceStable', 'distStable', 'elapsedSeconds', 'vitest', 'logSha256')}
a = O/'smoke'/'assertions.tsv'
if a.is_file():
    s['d2Assertions'] = [dict(zip(('name', 'result', 'detail'), l.split('\t', 2))) for l in a.read_text().splitlines() if l]
s['stderrLines'] = {n: rd(O/'smoke'/n) for n in ('noinit.stderr', 'nodeopts.stderr', 'init-final.stderr') if (O/'smoke'/n).is_file()}
s['cmdCheck'] = rd(O/'cmd-check.txt', 20)
s['buildNetworkLines'] = {n: rd(O/n, 40) for n in ('build-network-lines.txt',) if (O/n).is_file()}
(O/'summary.json').write_text(json.dumps(s, indent=2) + '\n')
print(json.dumps({'verdict': s['verdict']}))
PY
  exit $2
}

# ---------------------------------------------------------------- 2. capture-before + dist digest; must equal G9's
python3 $CAP $O/capture-before.json | tee $O/capture-before.summary
python3 - $G/capture-before.json $O/capture-before.json <<'PY' | tee $O/capture-compare.txt
import json, sys
g = json.load(open(sys.argv[1])); n = json.load(open(sys.argv[2]))
rows = [('source digest', g.get('digest'), n.get('digest')),
        ('dist digest', (g.get('dist') or {}).get('digest'), (n.get('dist') or {}).get('digest'))]
bad = 0
for name, a, b in rows:
    ok = a is not None and a == b
    bad += 0 if ok else 1
    print(f"{'OK  ' if ok else 'DIFF'} {name}: g9={a} now={b}")
if g.get('head') != n.get('head'):
    print(f"NOTE head g9={g.get('head')} now={n.get('head')}")
sys.exit(1 if bad else 0)
PY
if [[ ${pipestatus[1]} -ne 0 ]]; then
  say "!!!!!!!! CAPTURE MISMATCH: source or dist digest differs from G9 capture-before.json. Aborting before any docker build. !!!!!!!!"
  finish ABORTED_CAPTURE_MISMATCH 3
fi

# ---------------------------------------------------------------- 3. docker images before (read-only)
docker images --digests                      > $O/docker-images-before.txt   2>&1
docker images --format '{{json .}}'          > $O/docker-images-before.jsonl 2>&1
docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' > $O/docker-ps-before.txt 2>&1

# ---------------------------------------------------------------- 4. build stage + final image (no pulls)
BUILD_RC_STAGE=99; BUILD_RC_FINAL=99
docker build --progress=plain --pull=false --target build --build-arg IMAGE_TAG="$TAG" -t "$BTAG" studio-runner/ > $O/build-buildstage.log 2>&1
BUILD_RC_STAGE=$?; print $BUILD_RC_STAGE > $O/build-buildstage.exit
docker build --progress=plain --pull=false --build-arg IMAGE_TAG="$TAG" -t "$TAG" studio-runner/ > $O/build-final.log 2>&1
BUILD_RC_FINAL=$?; print $BUILD_RC_FINAL > $O/build-final.exit
export F_build_stage_rc=$BUILD_RC_STAGE F_build_final_rc=$BUILD_RC_FINAL
say "build: buildstage exit=$BUILD_RC_STAGE final exit=$BUILD_RC_FINAL"
# informational: any registry traffic the logs show (a pull of the base would appear here)
grep -hiE 'pulling|pull complete|resolve (docker\.io|mcr\.microsoft\.com)|load metadata for|docker\.io/docker/dockerfile|extracting' $O/build-buildstage.log $O/build-final.log > $O/build-network-lines.txt 2>&1
docker image inspect "$TAG" "$BTAG" > $O/image-inspect.json 2> $O/image-inspect.err
docker image inspect --format '{{json .Config.Cmd}}' "$TAG" > $O/cmd.json 2>/dev/null
F_image_id=$(docker image inspect --format '{{.Id}}' "$TAG" 2>/dev/null); export F_image_id
F_btag_id=$(docker image inspect --format '{{.Id}}' "$BTAG" 2>/dev/null); export F_btag_id

python3 - $ROOT/studio-runner/Dockerfile $O/image-inspect.json $TAG > $O/cmd-check.txt 2>&1 <<'PY'
import json, sys
dockerfile, inspect, tag = sys.argv[1:4]
lines = [l for l in open(dockerfile).read().splitlines() if l.startswith('CMD ')]
if len(lines) != 1:
    print(f'FAIL expected exactly one CMD line in the Dockerfile, found {len(lines)}'); sys.exit(1)
want = json.loads(lines[0][4:])
literal = ["sh", "-c", "ulimit -c 0 && exec node dist/main.js"]
try:
    img = next(i for i in json.load(open(inspect)) if tag in (i.get('RepoTags') or []))
except Exception as e:
    print(f'FAIL cannot read image {tag} from inspect JSON: {e}'); sys.exit(1)
cmd, ent = img['Config'].get('Cmd'), img['Config'].get('Entrypoint')
print('dockerfile CMD :', json.dumps(want)); print('image Config.Cmd:', json.dumps(cmd)); print('image Entrypoint:', json.dumps(ent))
ok = cmd == want and want == literal and not ent
print('PASS Config.Cmd equals the Dockerfile CMD (and the A6 literal); no ENTRYPOINT' if ok else 'FAIL Config.Cmd / Entrypoint mismatch')
sys.exit(0 if ok else 1)
PY
CMD_RC=$?; export F_cmd_check_rc=$CMD_RC
say "Config.Cmd check exit=$CMD_RC"
if [[ $BUILD_RC_STAGE -ne 0 || $BUILD_RC_FINAL -ne 0 ]]; then
  say "!!!!!!!! BUILD FAILED: C4b and D2 smoke NOT RUN !!!!!!!!"
  st C4b-runner-deployment NOTRUN-build-failed
  st D2-smoke NOTRUN-build-failed
  docker images --digests > $O/docker-images-after.txt 2>&1
  finish BUILD_FAILED 4
fi

# ---------------------------------------------------------------- 5. C4b: deployment tier against the fresh image
STUDIO_RUNNER_IMAGE=$TAG python3 $X9/run-runner.py obs009-g9-runner-deploy02 pnpm --config.package-manager-strict=false exec vitest run --config vitest.deployment.config.ts --minWorkers=1 --maxWorkers=1 > /dev/null 2>&1
C4B_RC=$?; export F_c4b_rc=$C4B_RC
st C4b-runner-deployment $C4B_RC

# ---------------------------------------------------------------- 6. D2 image smoke (pid1-launch-paths.md, "The image smoke that is owed")
rm_ours() {   # removes ONLY the exact names this script owns, plus its own volume
  local n
  for n in $SMOKE_NAMES; do
    if docker container inspect $n >/dev/null 2>&1; then docker rm -f $n >/dev/null 2>&1; fi
  done
  if docker volume inspect $TLSVOL >/dev/null 2>&1; then docker volume rm -f $TLSVOL >/dev/null 2>&1; fi
}
cleanup() { rm_ours; if [[ -n "$T" && -d "$T" ]]; then rm -rf "$T"; fi }
trap cleanup EXIT
: > $SMK/assertions.tsv
SMOKE_FAILS=0
chk() {   # chk <name> <0=pass|else fail> <detail>
  local res=pass
  if [[ $2 != 0 ]]; then res=FAIL; SMOKE_FAILS=$((SMOKE_FAILS+1)); fi
  printf '%s\t%s\t%s\n' "$1" "$res" "$3" >> $SMK/assertions.tsv
  say "  [$res] $1 :: $3"
}
say "--- D2 smoke"
rm_ours   # leftovers of an earlier aborted run of this script, by exact name

# Throwaway TLS material: the repository's deliberately public self-signed loopback fixtures (the ones the
# unit tests use), copied into a temp dir that is deleted on exit. Nothing is printed except the public fingerprint.
T=$(mktemp -d "${TMPDIR:-/tmp}/obs009-g9-tls.XXXXXX")
FX=$ROOT/studio-runner/test/fixtures/guided-tls
cp $FX/key.fixture  $T/tls.key
cp $FX/cert.fixture $T/tls.crt
cp $FX/cert.fixture $T/ca.crt
cp $FX/cert.fixture $T/controller-public.pem
printf '%s' 'obs009-g9-smoke-callback-token' > $T/callback.token
FP=$(node -e 'const c=require("node:crypto"),f=require("node:fs");process.stdout.write(new c.X509Certificate(f.readFileSync(process.argv[1])).fingerprint256)' $T/tls.crt)
cat > $T/env <<EOF
STUDIO_RUNNER_PORT=8443
STUDIO_RUNNER_SERVICE_IDENTITY=obs009-g9-smoke-service-identity
STUDIO_RUNNER_CALLBACK_IDENTITY=obs009-g9-smoke-callback-identity
STUDIO_RUNNER_CALLBACK_BASE_URL=https://callback.invalid:8443
STUDIO_RUNNER_TLS_KEY_FILE=/tls/tls.key
STUDIO_RUNNER_TLS_CERT_FILE=/tls/tls.crt
STUDIO_RUNNER_TLS_CA_FILE=/tls/ca.crt
STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256=$FP
STUDIO_RUNNER_GUIDED_ENABLED=true
STUDIO_RUNNER_GUIDED_WORKER_ID=obs009-g9-smoke-worker
STUDIO_RUNNER_GUIDED_JOURNAL_DIR=/journal
STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER=fixture-issuer
STUDIO_RUNNER_GUIDED_CONTROLLER_SUBJECT=controller
STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE=/tls/controller-public.pem
STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL=https://callback.invalid:8443
STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE=/tls/callback.token
EOF

# pwuser identity as the image defines it (not assumed)
docker run --rm --name $PFX-id --entrypoint id $TAG pwuser > $SMK/pwuser-id.txt 2> $SMK/pwuser-id.err
PWUID=$(sed -n 's/^uid=\([0-9]*\).*/\1/p' $SMK/pwuser-id.txt); PWGID=$(sed -n 's/.* gid=\([0-9]*\).*/\1/p' $SMK/pwuser-id.txt)
export F_pwuser_uid=$PWUID F_pwuser_gid=$PWGID
if [[ -z "$PWUID" || -z "$PWGID" ]]; then
  chk setup-pwuser-identity 1 "could not read uid/gid of pwuser from the image: $(head -c 200 $SMK/pwuser-id.err)"
  st D2-smoke 1; export F_d2_rc=1
  docker images --digests > $O/docker-images-after.txt 2>&1
  python3 $CAP $O/capture-after.json | tee $O/capture-after.summary
  finish SMOKE_SETUP_FAILED 5
fi
chk setup-pwuser-identity 0 "uid=$PWUID gid=$PWGID (the TLS mode check below expects gid 1001)"

# TLS files go into a named volume, then root-owned 0:<pwuser gid> mode 0440 (the chart's secret mount shape).
# A host bind mount cannot do this on Docker Desktop for Mac (the host cannot chgrp to 1001), and the 0440 + gid
# check (step 7) would then be untestable.
docker volume create $TLSVOL > /dev/null
docker create --name $PFX-tlsprep --user 0 --entrypoint sh -v $TLSVOL:/tls $TAG -c true > /dev/null 2> $SMK/tls-prep.err
docker cp $T/. $PFX-tlsprep:/tls/ >> $SMK/tls-prep.err 2>&1; CP_RC=$?
docker rm $PFX-tlsprep > /dev/null 2>&1
docker run --rm --name $PFX-tlsfix --user 0 --entrypoint sh -v $TLSVOL:/tls $TAG -c "chown 0:$PWGID /tls /tls/* && chmod 0555 /tls && chmod 0440 /tls/*" >> $SMK/tls-prep.err 2>&1; FIX_RC=$?
chk setup-tls-volume $((CP_RC + FIX_RC)) "docker cp exit=$CP_RC, chown/chmod exit=$FIX_RC"

COMMON=(--read-only --shm-size=512m
        --tmpfs /tmp:rw,mode=1777,size=512m
        --tmpfs /journal:rw,uid=$PWUID,gid=$PWGID,mode=0770,size=64m
        -v $TLSVOL:/tls:ro --env-file $T/env)
print -r -- "COMMON docker run args: ${COMMON[*]} (env file contents never logged)" > $SMK/commands.txt

# --- step 2: --read-only --init, guided on, tmpfs /tmp + journal. Assert listens, node pid > 1, exec probe exit 0.
say "step 2: run --init"
docker run -d --init --name $PFX-init "${COMMON[@]}" $TAG > $SMK/init-run.id 2> $SMK/init-run.err
print -r -- "docker run -d --init --name $PFX-init <COMMON> $TAG" >> $SMK/commands.txt
STARTED_OK=1
for i in {1..90}; do
  if docker logs $PFX-init 2>&1 | grep -q 'runner.started'; then STARTED_OK=0; break; fi
  if [[ "$(docker inspect --format '{{.State.Running}}' $PFX-init 2>/dev/null)" != "true" ]]; then break; fi
  sleep 1
done
docker logs $PFX-init > $SMK/init-start.stdout 2> $SMK/init-start.stderr
chk step2-listens $STARTED_OK "runner.started in logs within 90 s: $([[ $STARTED_OK == 0 ]] && echo yes || echo "NO; state=$(docker inspect --format '{{.State.Status}} exit={{.State.ExitCode}}' $PFX-init 2>&1)")"
if [[ $STARTED_OK == 0 ]]; then
  docker exec $PFX-init ps -A -o pid=,ppid=,args= > $SMK/init-ps.txt 2> $SMK/init-ps.err
  NODE_PID=$(awk '/node dist\/main\.js/ && $0 !~ /sh -c/ {print $1; exit}' $SMK/init-ps.txt)
  P1=$(awk '$1==1 {$1="";$2=""; sub(/^ +/,""); print; exit}' $SMK/init-ps.txt)
  if [[ -n "$NODE_PID" && "$NODE_PID" -gt 1 ]]; then chk step2-node-pid-gt-1 0 "node pid=$NODE_PID; pid 1 is: $P1"; else chk step2-node-pid-gt-1 1 "node pid='${NODE_PID}'; pid 1 is: $P1"; fi
  docker exec $PFX-init node dist/probe.js /health > $SMK/init-probe.stdout 2> $SMK/init-probe.stderr; PROBE_RC=$?
  chk step2-exec-probe-health $PROBE_RC "node dist/probe.js /health exit=$PROBE_RC"
  # step 7: TLS mount modes inside the container
  docker exec $PFX-init ls -ln /tls > $SMK/init-tls-ls.txt 2> $SMK/init-tls-ls.err
  KEYLINE=$(awk '$NF=="tls.key"' $SMK/init-tls-ls.txt)
  KEYMODE=$(print -r -- "$KEYLINE" | awk '{print $1}'); KEYGID=$(print -r -- "$KEYLINE" | awk '{print $4}')
  docker exec $PFX-init sh -c 'head -c 1 /tls/tls.key > /dev/null' 2> $SMK/init-tls-read.err; READ_RC=$?
  if [[ "$KEYMODE" == "-r--r-----" && "$KEYGID" == "1001" && $READ_RC == 0 ]]; then
    chk step7-tls-key-0440-gid1001-readable 0 "mode=$KEYMODE gid=$KEYGID readable-by-process exit=$READ_RC"
  else
    chk step7-tls-key-0440-gid1001-readable 1 "mode='$KEYMODE' gid='$KEYGID' (want -r--r----- / 1001) read exit=$READ_RC"
  fi
  # informational (A6): core limit of the running node, read from /proc (not gating)
  if [[ -n "$NODE_PID" ]]; then docker exec $PFX-init sh -c "grep -i 'core file' /proc/$NODE_PID/limits" > $SMK/init-core-limit.txt 2>&1; fi
fi

# --- step 3: WITHOUT --init -> exit 78, single stderr line CONFIGURATION_DENIED LAUNCH_TREE, nothing listens
say "step 3: run without --init"
docker run --name $PFX-noinit "${COMMON[@]}" $TAG > $SMK/noinit.stdout 2> $SMK/noinit.stderr; NOINIT_RC=$?
print -r -- "docker run --name $PFX-noinit <COMMON> $TAG   (no --init)" >> $SMK/commands.txt
NOINIT_ERR=$(cat $SMK/noinit.stderr)
chk step3-no-init-exit-78 $([[ $NOINIT_RC == 78 ]] && echo 0 || echo 1) "exit=$NOINIT_RC"
chk step3-no-init-stderr-LAUNCH_TREE $([[ "$NOINIT_ERR" == "CONFIGURATION_DENIED LAUNCH_TREE" ]] && echo 0 || echo 1) "stderr=$(print -r -- "$NOINIT_ERR" | head -3 | tr '\n' '|' | head -c 300)"
chk step3-no-init-nothing-listened $(grep -q 'runner.started' $SMK/noinit.stdout && echo 1 || echo 0) "runner.started absent from stdout: $(grep -c 'runner.started' $SMK/noinit.stdout)"
docker rm $PFX-noinit > /dev/null 2>&1

# --- step 4: NODE_OPTIONS set -> exit 78, CONFIGURATION_DENIED DEBUG_ENV.  Run WITH --init so the pid-1 refusal cannot explain it.
say "step 4: run --init with NODE_OPTIONS"
docker run --init --name $PFX-nodeopts -e NODE_OPTIONS=--max-old-space-size=1024 "${COMMON[@]}" $TAG > $SMK/nodeopts.stdout 2> $SMK/nodeopts.stderr; NODEOPTS_RC=$?
print -r -- "docker run --init --name $PFX-nodeopts -e NODE_OPTIONS=--max-old-space-size=1024 <COMMON> $TAG" >> $SMK/commands.txt
NODEOPTS_ERR=$(cat $SMK/nodeopts.stderr)
chk step4-node-options-exit-78 $([[ $NODEOPTS_RC == 78 ]] && echo 0 || echo 1) "exit=$NODEOPTS_RC"
chk step4-node-options-stderr-DEBUG_ENV $([[ "$NODEOPTS_ERR" == "CONFIGURATION_DENIED DEBUG_ENV" ]] && echo 0 || echo 1) "stderr=$(print -r -- "$NODEOPTS_ERR" | head -3 | tr '\n' '|' | head -c 300)"
docker rm $PFX-nodeopts > /dev/null 2>&1

# --- step 5: docker stop on the step-2 container -> runner.draining then runner.drained within the grace, exit 0
if [[ $STARTED_OK == 0 ]]; then
  say "step 5: docker stop"
  T0=$(date +%s)
  docker stop -t 30 $PFX-init > $SMK/stop.out 2> $SMK/stop.err; STOP_RC=$?
  T1=$(date +%s); STOP_SECS=$((T1 - T0))
  print -r -- "docker stop -t 30 $PFX-init  (exit=$STOP_RC, ${STOP_SECS}s)" >> $SMK/commands.txt
  docker logs $PFX-init > $SMK/init-final.stdout 2> $SMK/init-final.stderr
  cat $SMK/init-final.stdout $SMK/init-final.stderr > $SMK/init-final.merged   # logger writes to stdout; merged only for the order check
  DRAINING_LN=$(grep -n 'runner.draining' $SMK/init-final.stdout | head -1 | cut -d: -f1)
  DRAINED_LN=$(grep -n 'runner.drained' $SMK/init-final.stdout | head -1 | cut -d: -f1)
  EXITCODE=$(docker inspect --format '{{.State.ExitCode}}' $PFX-init 2>/dev/null)
  if [[ -n "$DRAINING_LN" && -n "$DRAINED_LN" && "$DRAINING_LN" -lt "$DRAINED_LN" ]]; then
    chk step5-stop-draining-then-drained 0 "runner.draining at stdout line $DRAINING_LN, runner.drained at line $DRAINED_LN"
  else
    chk step5-stop-draining-then-drained 1 "draining line='${DRAINING_LN}' drained line='${DRAINED_LN}'"
  fi
  chk step5-stop-within-grace $([[ $STOP_RC == 0 && $STOP_SECS -lt 30 ]] && echo 0 || echo 1) "docker stop exit=$STOP_RC after ${STOP_SECS}s of a 30 s grace"
  chk step5-container-exit-0 $([[ "$EXITCODE" == "0" ]] && echo 0 || echo 1) "container ExitCode=$EXITCODE"
  docker rm $PFX-init > /dev/null 2>&1
else
  chk step5-stop-draining-then-drained 1 "not run: the step-2 container never reported runner.started"
fi
say "step 6 (one real guided assign on Linux): NOT SCRIPTED. Still owed; recorded as such in summary.json."

D2_RC=$([[ $SMOKE_FAILS == 0 ]] && echo 0 || echo 1); export F_d2_rc=$D2_RC F_d2_failed_assertions=$SMOKE_FAILS F_d2_step6="not scripted (owed)"
st D2-smoke $D2_RC

# ---------------------------------------------------------------- 7. after
cleanup; T=""
docker images --digests                      > $O/docker-images-after.txt   2>&1
docker images --format '{{json .}}'          > $O/docker-images-after.jsonl 2>&1
docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}' > $O/docker-ps-after.txt 2>&1
python3 $CAP $O/capture-after.json | tee $O/capture-after.summary
python3 - $O/capture-before.json $O/capture-after.json <<'PY' | tee $O/capture-after-compare.txt
import json, sys
b = json.load(open(sys.argv[1])); a = json.load(open(sys.argv[2]))
print('source stable:', b.get('digest') == a.get('digest'), ' dist stable:', (b.get('dist') or {}).get('digest') == (a.get('dist') or {}).get('digest'))
PY
LEFT=$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -c "^$PFX-")
export F_leftover_smoke_containers=$LEFT
VERDICT=GREEN; [[ $C4B_RC != 0 || $D2_RC != 0 || $CMD_RC != 0 ]] && VERDICT=NOT_GREEN
finish $VERDICT $([[ $VERDICT == GREEN ]] && echo 0 || echo 1)
