"""Read verified off-tree original only; extract exact Java loop sites for author review."""
from pathlib import Path
import re,json,csv,hashlib
OUT=Path(__file__).resolve().parent
SRC=(OUT/'ReplayIT.original.java').read_text()
assert hashlib.sha256(SRC.encode()).hexdigest()=='b8b10df42b739d07d1abbd70ae1e54488f8a7587058a488e268445a396ac2475'

def mask_java(text):
    # Keep offsets/newlines; strip comments and Java string/char/text-block contents.
    out=list(text);i=0
    while i<len(text):
        end=None
        if text.startswith('//',i):
            end=text.find('\n',i);end=len(text) if end<0 else end
        elif text.startswith('/*',i):end=text.find('*/',i+2)+2
        elif text.startswith('"""',i):end=text.find('"""',i+3)+3
        elif text[i] in '\"\'':
            quote=text[i];j=i+1
            while j<len(text):
                if text[j]=='\\':j+=2;continue
                if text[j]==quote:break
                j+=1
            end=j+1
        if end is not None:
            assert end>i
            for j in range(i,end):
                if text[j]!='\n':out[j]=' '
            i=end
        else:i+=1
    return ''.join(out)

MASK=mask_java(SRC)
PAIRS={};stack=[]
for i,c in enumerate(MASK):
    if c in '({[':stack.append((c,i))
    elif c in ')}]':
        opening,j=stack.pop();assert '({['.index(opening)==')}]'.index(c)
        PAIRS[j]=i;PAIRS[i]=j
assert not stack
loops=[];do_while=set()
for match in re.finditer(r'\bdo\s*\{',MASK):
    opening=MASK.index('{',match.start());end=PAIRS[opening]
    tail=re.match(r'\s*while\s*\(',MASK[end+1:]);assert tail
    cond_start=end+1+tail.end()-1;cond_end=PAIRS[cond_start]
    do_while.add(end+1+tail.start()+len(tail[0])-len(tail[0].lstrip()))
    whilepos=MASK.index('while',end+1,cond_start);do_while.add(whilepos)
    loops.append(dict(start=match.start(),end=cond_end+2,kind='do',bodyStart=opening+1,
                      bodyEnd=end,condition=SRC[cond_start+1:cond_end]))
for match in re.finditer(r'\bwhile\s*\(',MASK):
    if match.start() in do_while:continue
    opening=MASK.index('(',match.start());cond_end=PAIRS[opening]
    body_start=cond_end+1
    while MASK[body_start].isspace():body_start+=1
    if MASK[body_start]!='{':continue
    end=PAIRS[body_start]
    loops.append(dict(start=match.start(),end=end+1,kind='while',bodyStart=body_start+1,
                      bodyEnd=end,condition=SRC[opening+1:cond_end]))
rows=list(csv.DictReader((OUT.parent/'11-IT-R/sleep-table.tsv').open(),delimiter='\t'))
lines=SRC.splitlines(True);offsets=[0]
for line in lines:offsets.append(offsets[-1]+len(line))
groups={}
for row in rows:
    if row['class']!='POLL':continue
    offset=offsets[int(row['line'])-1]+lines[int(row['line'])-1].index('Thread.sleep')
    candidates=[loop for loop in loops if loop['bodyStart']<=offset<loop['bodyEnd']]
    assert candidates,row
    loop=min(candidates,key=lambda l:l['end']-l['start'])
    key=loop['start'];groups.setdefault(key,{**loop,'ids':[],'rows':[]})
    groups[key]['ids'].append(int(row['id']));groups[key]['rows'].append(row)
result=[]
for loop in groups.values():
    loop['source']=SRC[loop['start']:loop['end']]
    loop['body']=SRC[loop['bodyStart']:loop['bodyEnd']]
    loop['line']=SRC.count('\n',0,loop['start'])+1
    result.append(loop)
(OUT/'loop-sites.json').write_text(json.dumps(result,indent=2)+'\n')
(OUT/'loop-sites.txt').write_text('\n\n'.join('### '+str(l['ids'])+' '+l['kind']+' '+str(l['line'])+'\n'+l['source'] for l in result))
print(json.dumps({'pollRows':sum(len(l['ids']) for l in result),'loops':len(result)}))
