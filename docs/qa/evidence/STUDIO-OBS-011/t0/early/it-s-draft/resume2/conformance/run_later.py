"""UNEXECUTED. Standalone scratch differential probe; never substitutes for native gates."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess

HERE = Path(__file__).resolve().parent
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true', required=True)
    parser.add_argument('--java-home', type=Path, required=True, help='Root-selected JDK21+ installation; no compiler is run during preparation')
    parser.add_argument('--scratch-directory', type=Path, required=True)
    args = parser.parse_args()
    scratch = args.scratch_directory.resolve()
    if not scratch.is_relative_to(Path('/private/tmp')) or not scratch.name.startswith('obs011-wait-conformance-'):
        parser.error('Use a new task-owned /private/tmp/obs011-wait-conformance-* directory')
    bindings = json.loads((HERE/'bindings.json').read_text())
    if sha(HERE/'WaitConformance.java') != bindings['generatedJavaSha256']:
        raise RuntimeError('Generated source binding changed; re-review required')
    its = HERE.parent
    bridge = its.parents[1]/'gs-t2-draft/resume2'
    records = {}
    for out, folder in [(bridge,'candidates'),(its,'repo')]:
        for record in json.loads((out/'loop-edits.json').read_text()):
            literal = record['replacement']
            if hashlib.sha256(literal.encode()).hexdigest()!=record['newSha256'] or literal not in (out/folder/record['path']).read_text():
                raise RuntimeError('Actual delivered block or its literal metadata changed')
            records[record['id']]=record['newSha256']
    for row in bindings['cases']:
        if records.get(row['id'])!=row['deliveredBoundSha256']:
            raise RuntimeError('Probe no longer binds the actual delivered block; regenerate and re-review')
    cp = json.loads((HERE/'classpath.json').read_text())
    for row in cp['jars']:
        if sha(Path(row['path'])) != row['sha256']:
            raise RuntimeError('Bound local classpath changed; do not install or fetch a substitute')
    scratch.mkdir(exist_ok=False)
    source = scratch/'WaitConformance.java'
    source.write_bytes((HERE/'WaitConformance.java').read_bytes())
    classpath = os.pathsep.join(row['path'] for row in cp['jars'])
    commands = [([str(args.java_home/'bin/javac'), '-cp', classpath, '-d', str(scratch), str(source)], 30),
                ([str(args.java_home/'bin/java'), '-cp', str(scratch)+os.pathsep+classpath, 'WaitConformance'], 60)]
    receipts = []
    try:
        for index, (command, timeout) in enumerate(commands):
            process = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
            (scratch/f'phase{index}.stdout').write_text(process.stdout)
            (scratch/f'phase{index}.stderr').write_text(process.stderr)
            receipts.append({'command':command,'exit':process.returncode,'maximumSeconds':timeout})
            if process.returncode:
                break
    except subprocess.TimeoutExpired as error:
        receipts.append({'timeout':True,'command':error.cmd,'maximumSeconds':error.timeout})
    finally:
        result = {'sourceSha256':sha(source), 'bindingSha256':sha(HERE/'bindings.json'),
                  'phases':receipts,'nativeGatesStillRequired':True,'sourceApplied':False}
        (scratch/'receipt.json').write_text(json.dumps(result,indent=2)+'\n')
    if len(receipts)!=2 or any(row.get('exit')!=0 for row in receipts):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
