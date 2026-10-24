"""Correct only this resume2 census metadata against actual authored source/map; no actual source read."""
from pathlib import Path
import json,csv,io
OUT=Path(__file__).resolve().parent
REL='backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'
rows=list(csv.DictReader((OUT/'sleep-table.tsv').open(),delimiter='\t'));keys=list(rows[0])
maps={int(r['id']):r for r in json.loads((OUT/'row-classification-proof-map.json').read_text())}
edits={n:e for e in json.loads((OUT/'poll-edits.json').read_text()) for n in e['ids']}
captures={n:e for e in json.loads((OUT/'poll-capture-review.json').read_text()) for n in e['ids']}
final=(OUT/'stages/04-b4/repo'/REL).read_text()
for row in rows:
 n=int(row['id']);m=maps[n]
 if row['class']=='DELIBERATE':continue
 e=edits[n];a=final.index(e['replacement'])+e['replacement'].index('org.awaitility.Awaitility.await(')
 row.update(proposed_replacement='Source candidate: direct same-thread Awaitility with local terminal/first-failure and one original interval-debt state; unchanged semantic deadline and original interval. Independent source/runtime review still required.',
  draft_stage='04-b4',draft_alias_line=str(final[:a].count('\n')+1),original_deadline=captures[n]['deadline'],interval_ms=str(captures[n]['intervalMs']),
  proof_status='UNEXECUTED_SOURCE_CORRECTION_INDEPENDENT_REVIEW_REQUIRED',
  conditional_carry='FAULT_PATH_PROOF_REQUIRED_NOT_CHOSEN' if n in [1,2,4,6,93,95] else 'NOT_CHOSEN_RUNTIME_PROOF_REQUIRED',
  evaluation_order=m['kind']+': '+m['finalTransition'],interruption_mapping=m['interrupt'],
  uncaught_policy='dontCatchUncaughtExceptions; ignoreNoExceptions; original site catches plus exact first-failure latch')
stream=io.StringIO();writer=csv.DictWriter(stream,fieldnames=keys,delimiter='\t',lineterminator='\n');writer.writeheader();writer.writerows(rows)
(OUT/'sleep-table.tsv').write_text(stream.getvalue())
print('95-row resume2 census metadata refreshed from exact corrected block locations; original census untouched')
