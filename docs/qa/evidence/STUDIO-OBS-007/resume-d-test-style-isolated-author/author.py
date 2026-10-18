from pathlib import Path
import json,subprocess,hashlib,difflib,re
root=Path('docs/qa/evidence/STUDIO-OBS-007/resume-d-test-style-isolated-author');files=(root/'files.txt').read_text().splitlines()
changes={f:[] for f in files};records=[l.split('\t') for l in (root/'proof-before/positions.tsv').read_text().splitlines()]
# Javac emits UTF16 offsets; convert to Python unicode source coordinates explicitly.
def pypos(s,n):
 return len(s.encode('utf-16-le')[:int(n)*2].decode('utf-16-le'))
for f in files:
 p=root/'candidate'/f;s=(root/'before'/f).read_text();sites=[r for r in records if r[0]=='B' and r[1]==f];inserts={}
 for r in sites:
  a,b=pypos(s,r[2]),pypos(s,r[3]);line=s[s.rfind('\n',0,a)+1:a];indent=re.match(r' *',line).group()
  inserts.setdefault(a,[]).append('{\n'+indent+'  ');inserts.setdefault(b,[]).append('\n'+indent+'}')
 for pos,parts in sorted(inserts.items(),reverse=True):
  text=''.join(parts);s=s[:pos]+text+s[pos:];changes[f].append({'kind':'brace-insertion','position':pos,'inserted':text})
 p.write_text(s)
def proof(side,target):
 args=['/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home/bin/java','-cp',str(root/'proof-tool'),'SourceProof',str(root/side),str(root/target)]+files
 r=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);(root/(target+'-command.json')).write_text(json.dumps({'command':args,'exitCode':r.returncode},indent=2)+'\n');(root/(target+'.log')).write_text(r.stdout+r.stderr);print(r.stdout.strip(),'exit',r.returncode);assert r.returncode==0
proof('candidate','proof-braces')
assert (root/'proof-before/ast.tsv').read_bytes()==(root/'proof-braces/ast.tsv').read_bytes()
assert (root/'proof-before/constants.tsv').read_bytes()==(root/'proof-braces/constants.tsv').read_bytes()
records=[l.split('\t') for l in (root/'proof-braces/positions.tsv').read_text().splitlines()]
# Every long physical literal line gets only cooked-equivalent wrapping. No emitted JS/SQL byte changes.
for f in files:
 p=root/'candidate'/f;s=p.read_text();literals=[]
 for r in records:
  if r[0]=='L' and r[1]==f:
   a,b=pypos(s,r[2]),pypos(s,r[3]);raw=s[a:b]
   if raw.startswith('"""'):
    literals.append((a,b,raw))
   else:
    for token in re.finditer(r'"(?:[^"\\\n]|\\[^\n])*"',raw):
     x,y=a+token.start(),a+token.end()
     lineEnd=s.find('\n',y);lineEnd=len(s) if lineEnd<0 else lineEnd
     if len(s[s.rfind('\n',0,x)+1:lineEnd])>120:literals.append((x,y,s[x:y]))
 for a,b,old in sorted(set(literals),reverse=True):
  if old.startswith('"""'):
   chunks=old.splitlines(True);new=[]
   # Closing delimiter's indentation is the existing JLS incidental-indent floor.
   closing=old.rfind('"""');beforeClose=old[old.rfind('\n',0,closing)+1:closing];indent=re.match(r' *',beforeClose).group()
   for line in chunks:
    # First line belongs to the original opener and is short; physical content is protected.
    logical=line.rstrip('\n');newline='\n' if line.endswith('\n') else ''
    if len(logical)>110 and '"""' not in logical:
     rest=logical
     while len(rest)>110:
      cut=100
      # Never cut an existing backslash escape or Java unicode escape.
      while cut>40 and (rest[cut-1]=='\\' or rest[cut]=='\\'):cut-=1
      space=rest.rfind(' ',40,cut)
      if space>=40:cut=space+1
      new.append(rest[:cut]+'\\\n');rest=indent+rest[cut:]
     new.append(rest+newline)
    else:new.append(line)
   replacement=''.join(new)
  elif old.startswith('"') and len(old)>70:
   content=old[1:-1];pieces=[]
   # Split only raw whitespace that cannot be part of a Java escape; normal SQL/JSON strings.
   while len(content)>65:
    cut=content.rfind(' ',20,65)
    if cut<20:
     # Safe ASCII comma boundary; no split through escaped quotes/backslashes/unicode.
     cut=content.rfind(',',20,65)
    if cut<20:break
    cut+=1;pieces.append(content[:cut]);content=content[cut:]
   if not pieces:continue
   pieces.append(content);baseIndent=re.match(r' *',s[s.rfind('\n',0,a)+1:a]).group()
   replacement='("'+pieces[0]+'"'+''.join('\n'+baseIndent+'    + "'+x+'"' for x in pieces[1:])+')'
  else:continue
  if replacement!=old:
   s=s[:a]+replacement+s[b:];changes[f].append({'kind':'literal-wrap','position':a,'before':old,'after':replacement})
 p.write_text(s)
# Remaining Java-only long physical lines may be broken at whitespace outside literal spans.
# They arise only from harmless source comments or brace additions; never remove text.
for f in files:
 p=root/'candidate'/f;s=p.read_text();lines=s.splitlines(True);out=[]
 for line in lines:
  if len(line.rstrip('\n'))>120 and not line.lstrip().startswith(('import ','package ')):
   # Literal wrapping is already complete. Report residual rather than guessing token boundaries.
   pass
  out.append(line)
 p.write_text(''.join(out))
(root/'transformations.json').write_text(json.dumps(changes,indent=2)+'\n')
proof('candidate','proof-after')
assert (root/'proof-before/ast.tsv').read_bytes()==(root/'proof-after/ast.tsv').read_bytes(),'AST mismatch'
assert (root/'proof-before/constants.tsv').read_bytes()==(root/'proof-after/constants.tsv').read_bytes(),'Cooked constants mismatch'
print('Exact canonical AST and compiled cooked String constant equivalence')
for f in files:
 lines=(root/'candidate'/f).read_text().splitlines();bad=[(i+1,len(l)) for i,l in enumerate(lines) if len(l)>120 and not l.lstrip().startswith(('import ','package '))]
 print(Path(f).name,'residual physical lines',bad[:30])
