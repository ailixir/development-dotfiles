from pathlib import Path
import json,hashlib
O=Path(__file__).resolve().parent
paths=['studio-runner/test/fixtures-tier/observed-bootstrap-process-tree.test.ts','studio-runner/test/helpers/bootstrapProcessTreeObservation.ts','studio-runner/test/run/bootstrapProcessTreeObservation.test.ts']
ledger=[]
def apply(text,before,after,count,cause):
 assert text.count(before)==count,(cause,text.count(before),count)
 ledger.append({'cause':cause,'before':before,'after':after,'replacements':count})
 return text.replace(before,after)
fixture=(O/'before'/paths[0]).read_text()
fixture=apply(fixture,'let inventoryWriteFailed=false;','const inventoryState:{failed:boolean}={failed:false};',1,'C1_TYPED_MUTABLE_FAILURE_STATE')
fixture=apply(fixture,'inventoryWriteFailed=true;','inventoryState.failed=true;',1,'C1_TYPED_MUTABLE_FAILURE_STATE')
fixture=apply(fixture,'if(inventoryWriteFailed)','if(inventoryState.failed)',1,'C1_TYPED_MUTABLE_FAILURE_STATE')
helper=(O/'before'/paths[1]).read_text();oldHelper=(O/'before-old-algorithm'/paths[1]).read_text()
oldPredicate=r'/[\u0000-\u001f\u007f]/u.test(command)'
newPredicate='Array.from(command).some(character=>{const code=character.charCodeAt(0);return code<=0x1f||code===0x7f;})'
helper=apply(helper,oldPredicate,newPredicate,1,'C2_EQUIVALENT_ASCII_CONTROL_PREDICATE')
assert oldHelper.count(oldPredicate)==1;oldHelper=oldHelper.replace(oldPredicate,newPredicate)
unit=(O/'before'/paths[2]).read_text()
unit=apply(unit,"import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';", "import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';\nimport type { MockInstance } from 'vitest';",1,'C4_TYPED_STORED_KILL_SPY')
unit=apply(unit,'let rows: FakeRow[];','let rows: FakeRow[];\nlet killSpy: MockInstance<typeof process.kill>;',1,'C4_TYPED_STORED_KILL_SPY')
unit=apply(unit,"vi.spyOn(process, 'kill').mockImplementation(() => true);", "killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);",1,'C4_TYPED_STORED_KILL_SPY')
unit=apply(unit,'vi.mocked(process.kill)','killSpy',17,'C4_TYPED_STORED_KILL_SPY')
unit=apply(unit,'${row.pid}','${String(row.pid)}',2,'C3_EXPLICIT_NUMERIC_STRING_CONVERSION')
unit=apply(unit,'${row.ppid}','${String(row.ppid)}',2,'C3_EXPLICIT_NUMERIC_STRING_CONVERSION')
for rel,text in zip(paths,[fixture,helper,unit]):
 p=O/'after'/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
 p=O/'red'/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(oldHelper if rel==paths[1] else text)
p=O/'old-algorithm'/paths[1];p.parent.mkdir(parents=True,exist_ok=True);p.write_text(oldHelper)
(O/'four-cause-edit-ledger.json').write_text(json.dumps(ledger,indent=2)+'\n')
print('Prepared v2 three-file red/green mirrors by exact text edits only; no parser or check executed.')
