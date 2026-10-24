"""Strict text-only compatibility diffs; never writes/applies source or invokes other mains."""
from pathlib import Path
import hashlib,json,re
O=Path(__file__).resolve().parent;B=O.parent.parent/'resume2/control'
def apply_exact(original,patch):
 src=original.splitlines(True);lines=patch.splitlines(True);i=2;cursor=0;dst=[]
 assert lines[0].startswith('--- a/') and lines[1].startswith('+++ b/')
 while i<len(lines):
  m=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n',lines[i]);assert m
  start=int(m[1]);n=int(m[2] or 1);end=int(m[3]);k=int(m[4] or 1);start=start-1 if n else start;end=end-1 if k else end
  assert start>=cursor;dst+=src[cursor:start];old=[];new=[];i+=1
  while i<len(lines) and not lines[i].startswith('@@ '):
   op=lines[i][0];value=lines[i][1:];assert op in ' +-'
   if op in ' -':old.append(value)
   if op in ' +':new.append(value)
   i+=1
  assert len(old)==n and len(new)==k and src[start:start+n]==old and len(dst)==end
  dst+=new;cursor=start+n
 return ''.join(dst+src[cursor:])
def main():
 members=json.loads((B/'manifest.json').read_text())['files'];byname={x['path']:x for x in members};seen={}
 for file,reverse in [('compatibility.forward.diff',False),('compatibility.reverse.diff',True)]:
  count=0
  for chunk in filter(None,re.split(r'(?=^--- a/)',(O/file).read_text(),flags=re.M)):
   first,second=chunk.splitlines()[:2];name=Path(first[6:]).name;assert name in byname
   before=(O/name).read_text() if reverse else (B/name).read_text();after=(B/name).read_text() if reverse else (O/name).read_text()
   assert apply_exact(before,chunk)==after;count+=1
  seen[file]=count
 expected=sum((B/x['path']).read_bytes()!=(O/x['path']).read_bytes() for x in members)
 assert seen['compatibility.forward.diff']==seen['compatibility.reverse.diff']==expected
 print(json.dumps({'status':'STRICT_TEXT_FORWARD_REVERSE_PASS','changedPredecessorMembers':expected,'sourceApplied':False,'runtimeInvoked':False}))
if __name__=='__main__':main()
