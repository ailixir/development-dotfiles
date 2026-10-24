"""Corrected metadata-only audit entrypoint. Source/patch writers remain sealed history.
No compiler/runtime/QA entrypoint is imported or invoked.
"""
from source_inventory import scan_source

def methods(source, path='<memory>'):
    return scan_source(source, path)['methods']

if __name__ == '__main__':
    import runpy
    from pathlib import Path
    runpy.run_path(str(Path(__file__).parent / 'reconcile.py'), run_name='__main__')
