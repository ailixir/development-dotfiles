"""Standalone read-only final verification; writes exclusive readiness/result only."""
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
    driver.require(__debug__ and len(sys.argv) == 2, 'EXACT_RELEASE_SHA_REQUIRED')
    release_sha = sys.argv[1]
    A = driver.read(driver.E / 'root-authorization.json')
    final.produce_final(driver, A, release_sha, driver.core(), time.time)
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except BaseException as exc:
        if isinstance(exc, SystemExit) and exc.code == 0:
            raise
        print('HOLD_GATEWAY80:' + (str(exc) if isinstance(exc, ValueError) else type(exc).__name__))
        sys.exit(1)
