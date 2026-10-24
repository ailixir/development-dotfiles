"""UNEXECUTED one-shot launcher; call only through the existing lock after root releases native work."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import subprocess
import time

O=Path(__file__).resolve().parent
ROOT=O.parents[6]
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute',action='store_true',required=True)
    parser.add_argument('--java-home',type=Path,required=True)
    parser.add_argument('--scratch-directory',type=Path,required=True)
    args=parser.parse_args()
    scratch=args.scratch_directory.resolve()
    if not scratch.is_relative_to(Path('/private/tmp')) or not scratch.name.startswith('obs011-wait-irq-'):
        parser.error('Choose a new owned /private/tmp/obs011-wait-irq-* directory')
    home=args.java_home.resolve()
    release=(home/'release').read_text()
    if not re.search(r'^JAVA_VERSION="21(?:\.|\+|")',release,re.M):
        parser.error('Select the actual installed cached Java21 home explicitly; install nothing')
    binding=json.loads((O/'bindings.json').read_text())
    if sha(O/'WaitIrqConformance.java')!=binding['generatedJavaSha256']:
        raise RuntimeError('Addendum source differs from its reviewed binding')
    for rel,facts in binding['sealedPackages'].items():
        directory=ROOT/rel
        if {str(p.relative_to(directory)) for p in directory.rglob('*') if p.is_file()}!=set(facts['files']):
            raise RuntimeError('Sealed package membership changed')
        for name,digest in facts['files'].items():
            if sha(directory/name)!=digest:raise RuntimeError('Sealed package bytes changed: '+rel+'/'+name)
    for row in json.loads((O/'input-bindings.json').read_text()):
        if sha(ROOT/row['path'])!=row['sha256']:raise RuntimeError('Input binding changed: '+row['path'])
    jar_rows=json.loads((O/'classpath.json').read_text())['jars']
    for row in jar_rows:
        if sha(Path(row['path']))!=row['sha256']:raise RuntimeError('Bound cached jar changed; do not fetch/install a replacement')
    scratch.mkdir(exist_ok=False)
    source=scratch/'WaitIrqConformance.java';source.write_bytes((O/'WaitIrqConformance.java').read_bytes())
    classpath=os.pathsep.join(row['path'] for row in jar_rows)
    proof=scratch/'owned-interval-proof.log'
    env=dict(os.environ);env['JAVA_HOME']=str(home);env['PATH']=str(home/'bin')+os.pathsep+env.get('PATH','')
    commands=[([str(home/'bin/javac'),'-g:lines,source','-encoding','UTF-8','-cp',classpath,'-d',str(scratch),str(source)],30),
              ([str(home/'bin/java'),'-cp',str(scratch)+os.pathsep+classpath,'WaitIrqConformance',str(proof)],60)]
    phases=[]
    started=time.monotonic();verified=False
    try:
        for number,(command,ceiling) in enumerate(commands):
            phase={'command':command,'maximumSeconds':ceiling}
            try:
                process=subprocess.run(command,capture_output=True,text=True,env=env,timeout=ceiling)
                phase['exit']=process.returncode
                (scratch/f'phase{number}.stdout').write_text(process.stdout)
                (scratch/f'phase{number}.stderr').write_text(process.stderr)
            except subprocess.TimeoutExpired as error:
                phase['timeout']=True
                for suffix,data in [('stdout',error.stdout),('stderr',error.stderr)]:
                    if data is not None:(scratch/f'phase{number}.{suffix}').write_bytes(data if isinstance(data,bytes) else data.encode())
            phases.append(phase)
            if phase.get('exit')!=0:break
        if len(phases)==2 and all(p.get('exit')==0 for p in phases) and proof.exists():
            lines=proof.read_text().splitlines()
            verified=(sum(line.startswith('PAIR_PASS ') for line in lines)==26 and
                      sum(' native-interval-before-owned-interrupt ' in line for line in lines)==52 and
                      sum(' uninterruptible-resleep-ack ' in line for line in lines)==26 and
                      sum(' joined ' in line for line in lines)==52 and
                      lines[-1]=='STATUS PASS 26 paired real-during-interval comparisons; no native-gate or timing credit')
    finally:
        receipt={'scope':'CONFORMANCE-I1 scratch only; native gates and original234 comparisons remain separate',
                 'status':'OBSERVABLE_PROBE_PASS' if verified else 'FAIL_OR_UNPROVED',
                 'sourceSha256':sha(source),'bindingsSha256':sha(O/'bindings.json'),
                 'java21Home':str(home),'java21ReleaseSha256':sha(home/'release'),
                 'phases':phases,'elapsedSeconds':time.monotonic()-started,
                 'proofSha256':sha(proof) if proof.exists() else None,'proofChecksPassed':verified,
                 'sourceApplied':False,'automaticRetry':False,'nativeGateCredit':False,'timingIdentityClaim':False}
        (scratch/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    if not verified:raise SystemExit(1)


if __name__=='__main__':main()
