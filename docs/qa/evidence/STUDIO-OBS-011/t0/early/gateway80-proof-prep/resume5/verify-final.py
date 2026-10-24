"""Standalone read-only final verification; writes exclusive readiness/result only."""
from pathlib import Path
import importlib.util
import sys
import time
import stat
sys.dont_write_bytecode = True
D = Path(__file__).absolute().parent
def entry_guard(directory, repository, expected_package):
    if directory != expected_package or repository not in directory.parents:
        raise ValueError('ENTRY_PACKAGE_PATH_CHANGED')
    chain = [repository]
    for part in Path(str(directory.relative_to(repository))).parts:
        chain.append(chain[-1] / part)
    for path in chain:
        if path.is_symlink() or not stat.S_ISDIR(path.lstat().st_mode):
            raise ValueError('ENTRY_PACKAGE_ROOT_OR_PARENT_LINK')
    for name in ('run-private.py', 'final-controls.py'):
        path = directory / name
        if path.is_symlink() or not stat.S_ISREG(path.lstat().st_mode):
            raise ValueError('ENTRY_MODULE_NOT_REGULAR')
entry_guard(D, Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio'), Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume5'))

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
