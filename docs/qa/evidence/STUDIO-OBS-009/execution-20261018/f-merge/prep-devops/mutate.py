#!/usr/bin/env python3
"""Spot-check mutations for the F-merge prep (chart + deployment tests). Each mutation edits the
live file, runs the focused deployment test, and restores the file byte for byte (cmp)."""
import json, os, shutil, subprocess, sys, hashlib, re
ROOT = '/Users/brunobuger/orca/workspaces/put-checks/ui-studio'
OUT = ROOT + '/docs/qa/evidence/STUDIO-OBS-009/execution-20261018/f-merge/prep-devops'
SCR = sys.argv[1]
H = ROOT + '/helm-chart/put-checks/templates/_helpers.tpl'
NP = ROOT + '/helm-chart/put-checks/templates/api-guided-tls-networkpolicy.yaml'
env = dict(os.environ)
env['PATH'] = os.path.expanduser('~/.local/share/fnm/node-versions/v24.20.0/installation/bin') + ':' + env['PATH']
env['STUDIO_RUNNER_IMAGE'] = 'put-checks-studio-runner:obs015-final07-local'

def sha(p): return hashlib.sha256(open(p,'rb').read()).hexdigest()

MUTS = [
 ('m1-connector-property-name-reverted', H, lambda s: s.replace('"studio.guided-authoring.connector.port"', '"studio.guided-authoring.tls-connector.port"')),
 ('m2-np-rule1-ordinary-port-deleted', NP, lambda s: re.sub(r"    # Rule 1:.*?\n    # Rule 2", "    # Rule 2", s, flags=re.S)),
 ('m3-np-api-pods-added-as-source', NP, lambda s: s.replace("""        - podSelector:
            matchLabels:
              {{- include "put-checks.worker.selectorLabels" . | nindent 14 }}
""","""        - podSelector:
            matchLabels:
              {{- include "put-checks.worker.selectorLabels" . | nindent 14 }}
        - podSelector:
            matchLabels:
              {{- include "put-checks.api.selectorLabels" . | nindent 14 }}
""")),
 ('m4-np-worker-source-dropped', NP, lambda s: s.replace("""        - podSelector:
            matchLabels:
              {{- include "put-checks.worker.selectorLabels" . | nindent 14 }}
""","")),
 ('m5-np-rendered-while-guided-off', NP, lambda s: s.replace('{{- if and (include "put-checks.studioRunner.guidedEnabled" .) .Values.studioRunner.networkPolicy.enabled }}','{{- if .Values.studioRunner.enabled }}',1)),
 ('m6-np-connector-in-open-rule', NP, lambda s: s.replace("""        - port: {{ .Values.backend.service.port }}
          protocol: TCP
""","""        - port: {{ .Values.backend.service.port }}
          protocol: TCP
        - port: {{ .Values.studioRunner.guided.tlsConnector.port }}
          protocol: TCP
""")),
 ('m7-np-egress-added', NP, lambda s: s.replace("    - Ingress\n","    - Ingress\n    - Egress\n",1)),
 ('m8-np-wrong-connector-port', NP, lambda s: s.replace("""      ports:
        - port: {{ .Values.studioRunner.guided.tlsConnector.port }}""","""      ports:
        - port: {{ .Values.studioRunner.guided.tlsConnector.servicePort | add 1 }}""")),
]
res = []
for name, path, fn in MUTS:
    bak = os.path.join(SCR, os.path.basename(path) + '.bak')
    shutil.copy2(path, bak)
    before = sha(path)
    src = open(path).read()
    new = fn(src)
    assert new != src, name + ' did not change the file'
    open(path, 'w').write(new)
    try:
        log = os.path.join(OUT, 'logs', 'mut-' + name + '.log')
        with open(log, 'w') as lf:
            p = subprocess.run(['pnpm','--config.package-manager-strict=false','exec','vitest','run','--config','vitest.deployment.config.ts','test/deployment/tls-client-cert.test.ts','--minWorkers=1','--maxWorkers=1'], cwd=ROOT+'/studio-runner', env=env, stdout=lf, stderr=subprocess.STDOUT, timeout=300)
        txt = open(log).read()
        m = re.search(r'Tests\s+(.*)', txt)
        failing = sorted(set(re.findall(r'FAIL\s+test/deployment/tls-client-cert.test.ts > (.*)', txt)))
        res.append({'mutation': name, 'exit': p.returncode, 'tests_line': m.group(1).strip() if m else None, 'failed_cases': failing[:6], 'n_failed_cases': len(failing)})
    finally:
        shutil.copy2(bak, path)
        assert sha(path) == before, 'restore mismatch ' + name
        res[-1]['restored_sha_equal'] = True
    print(name, res[-1]['exit'], res[-1]['tests_line'], flush=True)
json.dump(res, open(os.path.join(OUT,'mutations.json'),'w'), indent=2)
