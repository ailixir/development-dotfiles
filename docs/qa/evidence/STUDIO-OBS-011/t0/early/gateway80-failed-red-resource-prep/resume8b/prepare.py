"""Source-only authoring: write only this fresh successor; never execute a target."""
from pathlib import Path
import hashlib,json

D=Path(__file__).absolute().parent
OLD=D.parent/'resume8'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
assert sha((OLD/'manifest.json').read_bytes())=='3fe65bc487f8badf8329ff44040b11d1634e93145142eb3b5bd72d782a82190b'
names=('failed_gateway.py','custody.py','protocol.py','entry.py','contract.json',
 'guard-failed-red.bash','factory.py','installer.py','install-cli.py',
 'control-author.py','control-author-cli.py','control-author-loader.bash',
 'operator-completion.js','install-loader.bash','binding-functions.bash',
 'bind-command.template.bash','binding-wrapper.bash','buffer-bootstrap-inline.py',
 'buffer-verifier-inline.py','install-loader.bash.first-read-prefix.bash',
 'binding-functions.bash.first-read-prefix.bash','control-author-loader.bash.first-read-prefix.bash',
 'caller-bindings.json','trace-bearing-composition.json')
for name in names:
 raw=(OLD/name).read_bytes()
 raw=raw.replace(b'gateway80-failed-red-resource-prep/resume8',b'gateway80-failed-red-resource-prep/resume8b')
 raw=raw.replace(b'gateway80-failed-red-resource-code08-exact-review',b'gateway80-failed-red-resource-code08b-exact-review')
 if name=='failed_gateway.py':
  before=b'        if str(path) in self.external_inputs:return self.bound(path,cap=134217728)'
  assert raw.count(before)==1
  raw=raw.replace(before,b'        path=self.s.path(path)\n'+before)
 with (D/name).open('xb') as out:out.write(raw)
# Only required successor path/current-review bindings above; generation8/N04/FR05
# and literal Source07 bootstrap/verifier diagnostic origins remain unchanged.
callers=json.loads((D/'caller-bindings.json').read_bytes())
for row in callers['currentCallerSources']:
 raw=(D/row['path']).read_bytes();row.update(sha256=sha(raw),bytes=len(raw),firstReadCap=len(raw)+1)
callers['controlAuthorCliSha256']=sha((D/'control-author-cli.py').read_bytes())
callers['operatorHelperSha256']=sha((D/'operator-completion.js').read_bytes())
callers['beforeUse']=callers['beforeUse'].replace('code08 reviews','code08b reviews')
(D/'caller-bindings.json').write_text(json.dumps(callers,indent=2)+'\n')
trace=json.loads((D/'trace-bearing-composition.json').read_bytes())
for row in trace['payloads']:
 raw=(D/Path(row['payloadPath']).name).read_bytes()
 oldh,oldn=row['payloadSha256'],row['payloadBytes']
 row.update(payloadSha256=sha(raw),payloadBytes=len(raw))
 row['staged807Argv'][-2:]=[sha(raw),str(len(raw))]
 prefix=D/row['firstReadPrefix'];text=prefix.read_text()
 text=text.replace('-n '+str(oldn+1)+' ','-n '+str(len(raw)+1)+' ')
 text=text.replace('== '+str(oldn)+' ]]','== '+str(len(raw))+' ]]')
 prefix.write_text(text)
(D/'trace-bearing-composition.json').write_text(json.dumps(trace,indent=2)+'\n')
print(json.dumps(dict(sourceOnly=True,payloads=len(names),targetExecuted=False)))
