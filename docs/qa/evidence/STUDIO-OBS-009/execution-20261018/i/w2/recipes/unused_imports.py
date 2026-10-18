import re,sys
def clean(p, keep=()):
    s=open(p).read()
    removed=[]
    for m in list(re.finditer(r'^import (static )?([\w.]+)\.(\w+);\n',s,re.M)):
        name=m.group(3)
        if name in keep: continue
        body=s.replace(m.group(0),'',1)
        if not re.search(r'\b'+name+r'\b',body):
            removed.append(m.group(0).strip())
    for r in removed:
        s=s.replace(r+'\n','',1)
    open(p,'w').write(s)
    return removed
if __name__=='__main__':
    print(clean(sys.argv[1]))
