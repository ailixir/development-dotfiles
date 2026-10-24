"""Source-only literal registry and common outer sink/embed generation. No target IO."""
import ast,json
from pathlib import Path
HERE=Path(__file__).absolute().parent
ROOT=next(p for p in HERE.parents if p.name=='ui-studio')
registry={n:set() for n in ('CUSTODY_HOLD','PROTOCOL_HOLD','SOURCE06_VALUE_ERROR','BOOTSTRAP_VALUE_ERROR','OS_ERROR','UNMAPPED_FAILURE')}
def reasons(raw):
    values=set()
    for n in ast.walk(ast.parse(raw)):
        if isinstance(n,ast.Call):
            name=ast.unparse(n.func)
            args=n.args
            if name in ('need','P.need','require') and len(args)>=2 and isinstance(args[1],ast.Constant) and type(args[1].value)is str:values.add(args[1].value)
            if name.endswith(('ValueError','Hold')) and args and isinstance(args[0],ast.Constant) and type(args[0].value)is str:values.add(args[0].value)
    return values
registry['CUSTODY_HOLD']|=reasons((HERE/'custody.py').read_bytes())
for name in ('protocol.py','failed_gateway.py','factory.py','installer.py'):registry['PROTOCOL_HOLD']|=reasons((HERE/name).read_bytes())
for name in ('entry.py','install-cli.py'):registry['BOOTSTRAP_VALUE_ERROR']|=reasons((HERE/name).read_bytes())
for directory in (ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume6',):
    manifest=json.loads((directory/'manifest.json').read_bytes())
    for row in manifest['files']:
        if row['path'] in ('verified-inputs.py','run-private.py','contracts.py'):registry['SOURCE06_VALUE_ERROR']|=reasons((directory/row['path']).read_bytes())
core_raw=(ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/fullcheck-harness/resume3/harness.py').read_bytes()
core_names={'sha','utc','regular','capture','pid_text','table','identity','project_role','boundary_inventory'}
core_nodes=[n for n in ast.parse(core_raw).body if isinstance(n,ast.FunctionDef) and n.name in core_names]
registry['SOURCE06_VALUE_ERROR']|=reasons(ast.unparse(ast.Module(body=core_nodes,type_ignores=[])))
registry['BOOTSTRAP_VALUE_ERROR']|={'FAILED_BOOTSTRAP_INTEGRITY','CLEANUP_FAILURE_BOUND','FAILURE_SINK_CHILD_BOUND','FAILURE_SINK_ARGV_BOUND','FAILURE_SINK_BYTES_BOUND','BUFFER_METADATA','BUFFER_INTEGRITY','FINALIZATION_OWNER_REQUIRED','FINALIZATION_OWNER_CONFLICT','FINALIZATION_OWNER_TOKEN','FAILURE_AFTER_FINALIZATION'}
registry['OS_ERROR']={'OS_ERROR'};registry['UNMAPPED_FAILURE']={'UNMAPPED_FAILURE'}
registry={k:sorted(v) for k,v in registry.items()}
f=HERE/'protocol.py';s=f.read_text();stage_begin=s.index('STAGES=');stage_end=s.index('\nREASON_REGISTRY=',stage_begin);s=s[:stage_begin]+s[stage_begin:stage_end].replace("'",'"')+s[stage_end:];a=s.index('REASON_REGISTRY=');b=s.index('\nclass BootstrapValueError',a);s=s[:a]+'REASON_REGISTRY='+repr(registry).replace("'",'"')+s[b:];s=s.replace('raise ValueError("FAILURE_SINK_', 'raise BootstrapValueError("FAILURE_SINK_');f.write_text(s)
block=s[s.index('STAGES='):s.index('# END SINGLE OUTER FAILURE SINK')]
# Installed guard3 remains six-payload runtime member; old names untouched.
original=(HERE.parent/'resume2/guard-failed-red.bash').read_text()
g=original.replace('gateway80_failed_red_invoke','gateway80_failed_red03_invoke').replace('gateway80_failed_red_exit','gateway80_failed_red03_exit').replace('GATEWAY_FAILED_','GATEWAY_FR03_').replace('failed-red-resource-disposition01','failed-red-resource-disposition02')
a=g.index('class FailureSink:');b=g.index('\ndef require(ok):',a);g=g[:a]+block+g[b:]
g=g.replace('raise ValueError("FAILED_BOOTSTRAP_INTEGRITY")','raise BootstrapValueError("FAILED_BOOTSTRAP_INTEGRITY")')
g=g.replace('ns={"__name__":"_externally_verified_failed_entry"}', 'ns={"__name__":"_externally_verified_failed_entry","BootstrapValueError":BootstrapValueError}')
g=g.replace(' failure=error;status=1',' failure=error;sink.primary(error);status=1')
g=g.replace('status=1;failure=None;fds=[];chain=[]','finalizer=sink.claim_finalizer("GUARD")\nstatus=1;failure=None;fds=[];chain=[]')
g=g.replace('except BaseException as error:failure=error;status=1','except BaseException as error:\n   sink.cleanup(error)\n   if failure is None:failure=error;sink.primary(error,"CLOSE_ACCOUNTING")\n   status=1')
# Setup ownership is an external root control written after separately inspected
# binding. Its SHA is configured once; no future-hash/self-pin in installed auth.
g=g.replace('require(len(control)<=1 and ((mode=="negative")== (not control)))','require(len(control)==1)')
g=g.replace('  "$GATEWAY_FR03_PYTHON" -B -c', '  if [[ "$1" == negative ]]; then\n    [[ "$#" == 1 && "${GATEWAY_FR03_SETUP_SHA-}" =~ ^[0-9a-f]{64}$ ]] || return 1\n    set -- "$1" "$GATEWAY_FR03_SETUP_SHA"\n  fi\n  "$GATEWAY_FR03_PYTHON" -B -c')
g+="""
gateway80_fr03_bind_setup_sha() {
  [[ "$#" == 1 && "$1" =~ ^[0-9a-f]{64}$ && -z "${GATEWAY_FR03_SETUP_SHA-}" ]] || return 1
  readonly GATEWAY_FR03_SETUP_SHA="$1"
}
readonly -f gateway80_fr03_bind_setup_sha
"""
g=g.replace(' if failure is not None:sink.forward(failure)',' if failure is not None:sink.primary(failure)\n sink.finalize(finalizer)')
(HERE/'guard-failed-red.bash').write_text(g)
# Installer CLI uses the same definition before it reads any untrusted scope.
f=HERE/'install-cli.py';s=f.read_text();a=s.index('# CLOSED_FAILURE_BLOCK_START');b=s.index('# CLOSED_FAILURE_BLOCK_END',a);s=s[:a]+'# CLOSED_FAILURE_BLOCK_START\n'+block+s[b:];f.write_text(s)
(HERE/'source-reason-registry.json').write_text(json.dumps(dict(kind='SOURCE04_CLOSED_LITERAL_REASON_REGISTRY',registries=registry,oldReasonBackfill=False),indent=2)+'\n')
(HERE/'binding-functions.bash').write_text(g)
# Inert review template: no hash-then-source-reopen. Actual delivery uses builtin
# read of binding-functions.bash and foreground verifier, as RECIPE04 specifies.
(HERE/'bind-command.template.bash').write_text("# INERT: see RECIPE04.md; exact same readonly variable must be verified before eval.\n# ENTRY/AUTH arguments come from separately inspected installation result.\n"+g)
# Sealed installer launcher uses the same retained-FD verified-buffer barrier.
body=g.split("-B -c '",1)[1].split("' \"$GATEWAY_FR03_ENTRY\"",1)[0]
body=body.replace('path,expected,mode,authority,*control=sys.argv[1:]\n require(len(control)==1)','path,expected,scope_path,scope_sha=sys.argv[1:]')
body=body.replace('claim_finalizer("GUARD")','claim_finalizer("INSTALL_LOADER")')
body=body.replace('stat.S_IMODE(before.st_mode)==0o600','stat.S_IMODE(before.st_mode)==0o644')
body=body.replace('status=ns["execute"](mode,authority,control[0] if control else None,failure_sink=sink)','result=ns["execute"](scope_path,scope_sha,failure_sink=sink,verified_self_sha=expected)\n status=0 if result.get("installationExit")==0 and type(result.get("installationExit"))is int else 1')
loader='''# INACTIVE sealed source03 installation launcher; separate root scope required.
gateway80_fr03_install_once() {
  [[ "$#" == 3 && "$1" =~ ^[0-9a-f]{64}$ && "$3" =~ ^[0-9a-f]{64}$ && -z "${GATEWAY_FR03_INSTALL_STARTED-}" ]] || return 1
  readonly GATEWAY_FR03_INSTALL_STARTED=1
  '/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/bin/python3.13' -B -c '
'''+body+'''\n' '/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume4/install-cli.py' "$1" "$2" "$3" < /dev/null
}
readonly -f gateway80_fr03_install_once
'''
(HERE/'install-loader.bash').write_text(loader)
print(json.dumps(dict(status='SOURCE_ONLY_EMBEDS_WRITTEN',actualSubjectActions=0)))
