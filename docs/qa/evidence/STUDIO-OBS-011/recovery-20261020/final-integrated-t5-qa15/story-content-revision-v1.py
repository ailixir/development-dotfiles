"""QA15 public story-content revision v1; document bookkeeping only."""
from pathlib import Path
import hashlib,re,sys

def canonicalize(raw):
    text=raw.decode('utf-8').replace('\r\n','\n').replace('\r','\n')
    kept=[]; admin=False; status_count=0; headings={'## QA Results':0,'## Change Log':0}
    for line in text.splitlines(keepends=True):
        heading=line.rstrip('\n')
        if line.startswith('## '):
            admin=heading in headings
            if admin:headings[heading]+=1
            kept.append(line)
            continue
        if admin:continue
        match=re.fullmatch(r'(\| Status \| )\*\*(Draft|Ready|InProgress|InReview|Done)\*\*( \|)(\n?)',line)
        if match:
            line=match[1]+'**<LIFECYCLE_STATUS>**'+match[3]+match[4]
            status_count+=1
        line=re.sub(r'^([ \t]*[-*+][ \t]+)\[[ xX]\](?=[ \t])',r'\1[ ]',line)
        kept.append(line)
    assert status_count==1 and all(count==1 for count in headings.values())
    return ''.join(kept).encode('utf-8')

def reviewed_revision(raw):
    return 'story-content-sha256-v1:'+hashlib.sha256(canonicalize(raw)).hexdigest()

if __name__=='__main__':
    assert len(sys.argv)==2
    print(reviewed_revision(Path(sys.argv[1]).read_bytes()))
