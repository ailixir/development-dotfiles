"""Inactive04 fixture and operator API amendments; no runtime boundaries."""
from pathlib import Path
import json
P=Path(__file__).absolute().parent
assert P.name=='resume4'
p=P/'guard-public-observe.bash';s=p.read_text()
s=s.replace('path, expected, release, explicit = sys.argv[1:]','path, expected, release, entry_name, entry_sha, explicit = sys.argv[1:]')
s=s.replace('sys.argv = [path, "gate", release, explicit]','sys.argv = [path, "gate", release, entry_name, entry_sha, explicit]')
s=s.replace('if [[ "$#" == 1 && ( "$1" == 0 || "$1" == 1 ) &&','if [[ "$#" == 3 && ( "$1" == 0 || "$1" == 1 ) &&\n        "$2" =~ ^entry-[0-9]{4}-pins\\.json$ && "$3" =~ ^[0-9a-f]{64}$ &&')
s=s.replace('"$C8_PUBLIC_CONTROL" "$C8_PUBLIC_CONTROL_SHA" "$C8_PUBLIC_RELEASE_SHA" "$1" < /dev/null','"$C8_PUBLIC_CONTROL" "$C8_PUBLIC_CONTROL_SHA" "$C8_PUBLIC_RELEASE_SHA" "$2" "$3" "$1" < /dev/null')
p.write_text(s)
p=P/'runtime_adapter_checks.py';s=p.read_text()
s=s.replace("e.loaded_local, e.client, e.utilities, e.sequence, e.observation_sequence, e.registration_complete = {}, None, [], 0, 0, False", """e.loaded_local, e.client, e.utilities, e.sequence, e.observation_sequence, e.registration_complete = {}, None, [], 0, 0, False
    e.external_control_pins, e.generated_control_buffers = {}, {}
    e.selected_lifecycle, e.selected_claim_sha, e.selected_authority_sha = None, None, None
    e.custody_retained=False""")
s=s.replace("'UTILITY_HISTORY_INCOMPLETE')", "'LOCAL_IMMUTABLE_CHANGED')")
s=s.replace("e.write_once('selected-consumed.json',dict(phase='selected',releaseSha256=e.a['releaseSha256'],attemptCap=1))", """e.claim_once('selected')
    e.external_control_pins['root-selected-decision.json']='d'*64
    e.selected_authority_sha='d'*64
    e.selected_lifecycle='AUTHORIZED_PENDING_SETUP'""")
# Existing reader-focused tests call load through the now explicit synthetic operator tuple.
s=s.replace("    return system, release_sha\n\n\ndef bootstrap_tests", """    entry_name='entry-0001-pins.json'
    pins={Path(n).name:A['sha'](v[0]) for n,v in system.files.items()
          if Path(n).parent==A['CONTROL'] and n.endswith('.json')
          and Path(n).name not in A['ARTIFACTS'] and Path(n).name!='root-release.json'}
    entry=A['packed'](dict(schemaVersion=1,kind='EXACT_ENTRY_EXISTING_CONTROL_PINS',authorizedBy='root',
        releaseSha256=release_sha,mode='held-proof',controlPins=pins))
    system.put(A['CONTROL']/entry_name,entry)
    system.entry_args=(entry_name,A['sha'](entry),'held-proof')
    return system, release_sha


def bootstrap_tests""")
s=s.replace("A['load'](system, release_sha)","A['load'](system, release_sha, *system.entry_args)")
p.write_text(s)
p=P/'boundary03_checks.py';s=p.read_text()
s=s.replace("e.loaded_local={};e.relay=None", "e.loaded_local={};e.external_control_pins={};e.generated_control_buffers={};e.selected_lifecycle='SETUP_STARTED';e.selected_claim_sha=None;e.selected_authority_sha=None;e.custody_retained=False;e.relay=None")
s=s.replace("    e.utility=lambda *args:", "    e.external_control_pins['selected-consumed.json']=A.sha(b.files[str(A.CONTROL/'selected-consumed.json')])\n    e.utility=lambda *args:")
p.write_text(s)

entry=dict(schemaVersion=1,kind='EXACT_ENTRY_EXISTING_CONTROL_PINS',authorizedBy=None,
 releaseSha256=None,mode=None,controlPins={})
(P/'runtime-entry-control-pins.template.json').write_text(json.dumps(entry,indent=2)+'\n')
for n in ('runtime-root-admission.template.json','runtime-phase-decision.template.json',
          'runtime-actual-evidence-disposition.template.json','runtime-close-permit.template.json','runtime-wrapper-result.template.json'):
    v=json.loads((P/n).read_text())
    v['entryControlAuthorization']='Separate exact entry-NNNN-pins.json raw SHA supplied by root/operator argv; this document itself must be pinned before first parse in every consuming entry'
    (P/n).write_text(json.dumps(v,indent=2)+'\n')
text='''\n## Source04 mandatory independent entry pins\n\n+Each CLI entry takes `MODE RELEASE_SHA entry-NNNN-pins.json ENTRY_RAW_SHA [STATUS]`.
The operator first creates a new immutable root-authored entry pin record and independently
inspects its exact raw SHA. It binds the exact release, CLI mode, and every existing control
JSON/client/utility/observation/native/drain/phase/result/admission/collection/disposition/
readiness/permit/wrapper journal. It includes active-lock and prior entry pin documents,
excludes itself, root-release (already explicit RELEASE_SHA), and installed artifact JSON
(already release-pinned). No wildcard, directory-derived grant, first-read self-pin, stale
control hash, next-entry alias, or reciprocal release/active hash is valid. Root must account
all actual results/clients/utilities before binding the next entry; an unexpected JSON member
or missing independent pin denies before any existing control JSON interpretation.

For the negative gate use `exit 1 entry-NNNN-pins.json ENTRY_RAW_SHA`; for the final gate use
`exit EXPECTED_STATUS entry-NNNN-pins.json ENTRY_RAW_SHA`. The readonly loader forwards these
explicit arguments. Guard setup arguments remain the four exact release/Python/adapter/hash
bindings. Held proof additionally has literal final argument1; all other modes have no status.
These replace abbreviated old exit examples above. Never invoke an unpinned CLI entry.

The selected cap is claimed before all setup. Only the exact newly claimed, externally
authorized selected client can have AUTHORIZED_PENDING_SETUP: same claim identity/hash,
root-selected decision external pin, no relay/native/terminal records, no relay or receipt.
Actual current/source/inherited/resource checks remain fresh. Setup immediately ends this
state; partial, live, terminal, later-client and unresolved cases require their real receipts.
No future selected-drain is fabricated. No retry or allowance reset exists.

Main discharges output/control custody only when no relay exists or actual thread termination
and descriptor closes are confirmed. Unresolved READY/serve/fsync/stop/BaseException paths
retain Effects, thread, output, control, authority and descriptor references plus a closed
partial receipt. No cross-thread force-close, cleanup, fake drain or generic recovery follows.
Actual joined closure or a separately reviewed exact disposition is required to discharge.
'''
for n in ('RECIPE.md','RUNTIME-RECIPE.md'):
    with (P/n).open('a') as f:f.write(text)
print('Updated source04 fixtures, guard and inert per-entry templates/recipes')
