"""Success gate: recheck after separately inspected final0 and root permit."""
from pathlib import Path
import importlib.util
import sys
import time
sys.dont_write_bytecode = True
D = Path(__file__).resolve().parent
def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, D / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
driver = load('gateway80_driver', 'run-private.py')
final = load('gateway80_final', 'final-controls.py')

def main():
    driver.require(__debug__ and len(sys.argv) == 3, 'UNBOUND_GATE_CALL')
    release_sha, requested = sys.argv[1:]
    driver.require(requested == '0', 'SUCCESS_ONLY_CLOSE_EXPECTED_ZERO')
    A = driver.read(driver.E / 'root-authorization.json')
    permit = driver.read(driver.E / 'close.root-permit.json')
    result = final.close_check(driver, A, release_sha, permit, driver.core(), time.time)
    result['rootPermitSha256'] = driver.file_hash(driver.E / 'close.root-permit.json')
    driver.write_new(driver.E / ('allow-close-' + str(time.time_ns()) + '.json'), result)
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except BaseException as exc:
        if isinstance(exc, SystemExit) and exc.code == 0:
            raise
        print('HOLD_GATEWAY80:' + (str(exc) if isinstance(exc, ValueError) else type(exc).__name__))
        sys.exit(1)
