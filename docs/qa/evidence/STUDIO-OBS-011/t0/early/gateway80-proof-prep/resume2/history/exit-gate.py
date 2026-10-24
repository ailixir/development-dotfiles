"""Prepared success-close backstop specific to gateway80; not a GST/C8 guard.

An unexpected outcome remains HOLD for exact root/QA disposition. This does not
authorize recovery signals, a retry, or an unreviewed failure-release shortcut.
"""
from pathlib import Path
import importlib.util
import json
import sys
import time

sys.dont_write_bytecode = True
D = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('gateway80_driver', D / 'run-private.py')
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)


def main():
    require = driver.require
    require(__debug__ and len(sys.argv) == 3, 'UNBOUND_GATE_CALL')
    release_sha, requested = sys.argv[1:]
    E, W = driver.E, driver.W
    A = driver.read(E / 'root-authorization.json')
    require(driver.file_hash(E / 'root-authorization.json') == release_sha
            and A['authorized'] is True, 'ROOT_RELEASE_REQUIRED')
    require(driver.file_hash(D / 'manifest.json') == A['packetManifestSha256'], 'PACKET_SEAL')
    for row in driver.read(D / 'manifest.json')['files']:
        require(driver.file_hash(D / row['path']) == row['sha256'], 'PACKET_MEMBER_CHANGED')
    permit_path = E / 'close.root-permit.json'
    require(permit_path.is_file(), 'FINAL_ROOT_PERMIT_REQUIRED')
    permit = driver.read(permit_path)
    require(permit['releaseSha256'] == release_sha and permit['authorized'] is True
            and permit['expectedWrapperExit'] == int(requested) == 0, 'CLOSE_PERMIT_SCOPE')
    require(permit['independentActualReviewSha256'] and permit['credit'] is False,
            'ACTUAL_REVIEW_REQUIRED')
    require(0 <= time.time() - permit['verifiedAtEpoch'] <= 60, 'STALE_ROOT_PERMIT')
    C = driver.core()
    H = driver.held(A, C)
    driver.guards(A, C)
    driver.boundary(H, C)
    require(set(permit['receiptPins']) == set(driver.SCOPE['phaseIds']), 'ALL_PHASE_PINS_REQUIRED')
    known = {}
    for phase, h in permit['receiptPins'].items():
        p = E / (phase + '.receipt.json')
        require(driver.file_hash(p) == h, 'PHASE_RECEIPT_CHANGED')
        receipt = driver.read(p)
        require(receipt['accepted'] is True and not receipt['stickyFlags']
                and receipt['releaseSha256'] == release_sha, 'PHASE_NOT_ACCEPTED')
        if phase in ('red', 'green'):
            native = receipt['native']
            require(native['status'] == 'TERMINAL' and not native['stickyFlags']
                    and native['timedOut'] is False, 'NATIVE_NOT_TERMINAL')
            for f in native['ownedIdentities']:
                known[(f['pid'], f['start'])] = f
    rows = C['table']()
    require(all((rows.get(pid) or {}).get('start') != start for pid, start in known),
            'OWNED_DESCENDANT_SURVIVES')
    driver.workspace_guard('fixed')
    archive = driver.read(E / 'archive.receipt.json')
    require(driver.owned_root_identity() == archive['workspace'], 'OWNED_ROOT_CHANGED')
    require(driver.inventory(W) == archive['workspaceInventory'], 'WORKSPACE_CHANGED_AFTER_ARCHIVE')
    require(driver.inventory(E / 'complete-workspace-archive') == archive['archiveInventory'],
            'ARCHIVE_CHANGED')
    driver.held(A, C)
    require(0 <= time.time() - permit['verifiedAtEpoch'] <= 60, 'PERMIT_EXPIRED_DURING_CHECK')
    driver.write_new(E / ('allow-close-' + str(time.time_ns()) + '.json'),
                     {'status': 'ALLOW_VERIFIED_GATEWAY80', 'requestedExit': int(requested),
                      'rootPermitSha256': driver.file_hash(permit_path), 'releaseSha256': release_sha,
                      'actualRenderCountClaimed': False, 'credit': False})
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except BaseException as exc:
        # SystemExit(0) is a success, not a HOLD.
        if isinstance(exc, SystemExit) and exc.code == 0:
            raise
        print('HOLD_GATEWAY80:' + (str(exc) if isinstance(exc, ValueError) else type(exc).__name__))
        sys.exit(1)
