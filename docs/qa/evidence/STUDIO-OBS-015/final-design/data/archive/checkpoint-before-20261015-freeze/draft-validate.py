#!/usr/bin/env python3
"""Local PG14 proposal validation only. Never targets an existing or developer database."""
import pathlib,subprocess,tempfile,json,hashlib,shutil,socket,datetime,os
here=pathlib.Path(__file__).resolve().parent
root=here.parents[5]
receipt={'classification':'DRAFT_SQL_ONLY_NOT_PRODUCTION_IMPLEMENTATION_OR_FLYWAY_PROOF','startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'commands':[],'version':subprocess.check_output(['pg_config','--version'],text=True).strip()}
work=pathlib.Path(tempfile.mkdtemp(prefix='.scratch-pg-',dir=here)); data=work/'data'
with socket.socket() as sock:
 sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
started=False

def run(args,**kw):
 r=subprocess.run(args,capture_output=True,text=True,timeout=90,**kw)
 receipt['commands'].append({'argv':args,'exitCode':r.returncode,'stdout':r.stdout[-6000:],'stderr':r.stderr[-6000:]})
 if r.returncode: raise RuntimeError('Draft validation command failed: '+args[0])
 return r.stdout
try:
 run(['initdb','-D',str(data),'--auth=trust','--no-locale','-E','UTF8'])
 run(['pg_ctl','-D',str(data),'-l',str(work/'server.log'),'-o',f"-h 127.0.0.1 -p {port} -c unix_socket_directories=''",'-w','start']); started=True
 psql=['psql','-X','-q','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',str(port),'-d','postgres']
 paths=sorted((root/'backend/src/main/resources/db/migration').glob('V*.sql'),key=lambda p:int(p.name.split('__')[0][1:]))
 receipt['frozenMigrationHashes']={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
 if len(paths)!=20: raise RuntimeError('Expected frozen V1-V20 only')
 for p in paths: run(psql+['-1','-f',str(p)])
 draft=here/'V21__guided_session_replaying_prefix.sql'; receipt['draftSqlSha256']=hashlib.sha256(draft.read_bytes()).hexdigest()
 run(psql+['-1','-f',str(draft)])
 run(psql+['-c',"SELECT conname,pg_get_constraintdef(oid) FROM pg_constraint WHERE conname IN ('ck_guided_session_state_v3','studio_guided_translation_state_continuation_check','fk_015_materialization_head'); SELECT studio_015_declarations('{\"variables\":[],\"secrets\":[],\"authoredDeclarations\":[]}'::jsonb) AS empty_declarations_valid; SELECT studio_015_declarations('{\"variables\":[],\"secrets\":[],\"authoredDeclarations\":[{\"referenceId\":\"vault://x\",\"kind\":\"secretRef\",\"secretId\":\"LOGIN_PASSWORD\"}]}'::jsonb) AS opaque_alias_valid;"])
 if (here/'draft-smoke.sql').exists(): run(psql+['-1','-f',str(here/'draft-smoke.sql')])
 receipt['status']='PASS_DRAFT_DDL_AND_LISTED_SMOKE_ONLY'
except Exception as e:
 receipt['status']='FAIL_DRAFT_CHECK'; receipt['error']=str(e)
finally:
 if (work/'server.log').exists(): receipt['serverLogTail']=(work/'server.log').read_text()[-10000:]
 if started or (data/'postmaster.pid').exists():
  try: run(['pg_ctl','-D',str(data),'-m','fast','-w','stop'])
  except Exception as e: receipt['cleanupError']=str(e)
 if not receipt.get('cleanupError'): shutil.rmtree(work); receipt['isolatedDirectoryRemoved']=True
 receipt['finishedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 (here/'draft-validation-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
 print(json.dumps({k:receipt[k] for k in ['classification','status','version','isolatedDirectoryRemoved'] if k in receipt},indent=2))
 if receipt['status'].startswith('FAIL'): print(receipt['commands'][-1] if receipt['commands'] else receipt['error']); raise SystemExit(1)
