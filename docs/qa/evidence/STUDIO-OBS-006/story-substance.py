#!/usr/bin/env python3
"""Hash story substance while excluding only owned lifecycle/QA/Change Log metadata."""
from pathlib import Path
import re, hashlib, json

def substantive(text):
    # Exact top-level headings delimit owned metadata; other sections are preserved byte-for-byte.
    text=re.sub(r'(?m)^\| Status \| \*\*[^\n|]+\*\* \|$', '| Status | **LIFECYCLE_METADATA** |', text)
    text=re.sub(r'(?ms)^## QA Results\n.*?(?=^## |\Z)', '## QA Results\n', text)
    text=re.sub(r'(?ms)^## Change Log\n.*?(?=^## |\Z)', '## Change Log\n', text)
    return text

if __name__=='__main__':
    root=Path(__file__).resolve().parents[4]
    story=root/'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-006.story.md'
    digest=hashlib.sha256(substantive(story.read_text()).encode()).hexdigest()
    proof=json.loads((Path(__file__).parent/'lifecycle-verification.json').read_text())
    print(json.dumps({'storySubstantiveSha256':digest,'matches':digest==proof['storySubstantiveSha256'],'excluded':'Exact Status row; contents of top-level QA Results and Change Log only'},indent=2))
    raise SystemExit(digest!=proof['storySubstantiveSha256'])
