import re,sys
path=sys.argv[1]; names=sys.argv[2].split(',')
lines=open(path,encoding='utf-8').read().split('\n')
start_schemas=lines.index('  schemas:')
key=re.compile(r'^    ([A-Za-z0-9_]+):\s*$')
removed=[]
for name in names:
    idx=[i for i,l in enumerate(lines) if i>start_schemas and l==f'    {name}:']
    assert len(idx)==1,(name,idx)
    i=idx[0]
    # include immediately preceding 4-space comment lines that document this schema
    s=i
    while s-1>start_schemas and lines[s-1].startswith('    #'): s-=1
    j=i+1
    while j<len(lines) and not key.match(lines[j]) and not re.match(r'^  [A-Za-z]',lines[j]) and not (lines[j].startswith('    #')):
        j+=1
    # drop trailing blank lines belonging to the block but keep one separator
    removed.append((name,s+1,j,lines[s:j][:1]))
    del lines[s:j]
open(path,'w',encoding='utf-8').write('\n'.join(lines))
for r in removed: print(r[0],'lines',r[1],'-',r[2])
