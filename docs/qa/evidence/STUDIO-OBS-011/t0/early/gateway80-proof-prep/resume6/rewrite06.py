"""Source-only deterministic edits of the copied, already verified packet05."""
from pathlib import Path
import ast,hashlib,json
D=Path(__file__).parent
p=D/'run-private.py';s=p.read_text()
a=s.index('def bootstrap_scope():');b=s.index('utc = ',a)
s=s[:a]+'''# Entry bootstrap supplies verified scope/contracts and retained immutable buffers.
# No package JSON/import interpretation happens at module import time.
SCOPE = {}
W = Path('/private/tmp/obs009-gateway80-offtree03-20261019')
E = R / 'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs009-gateway80-offtree03-20261019'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def retained_bytes(path, expected=None):
    """A single custody-checked buffer, hashed before interpretation, per immutable input."""
    key = str(path)
    retained = globals().setdefault('IMMUTABLE_BYTES', {})
    if key not in retained:
        guard_leaf(path)
        reader = globals().get('SAFE_READER')
        if reader is not None:
            raw = reader(path)
        else:
            # Fake controls supply an equivalent reader; actual entry bootstrap always sets SAFE_READER.
            raw = path.read_bytes()
        require(isinstance(raw, bytes), 'IMMUTABLE_BUFFER_TYPE')
        retained[key] = raw
    raw = retained[key]
    actual = hashlib.sha256(raw).hexdigest()
    if expected is not None:
        require(actual == expected, 'VERIFIED_IMMUTABLE_BUFFER_CHANGED')
    globals().setdefault('IMMUTABLE_DIGESTS', {})[key] = actual
    return raw


def read_verified(path, expected):
    return json.loads(retained_bytes(path, expected))


def read(path):
    # Package/runtime JSON is immutable within one observer invocation. Every
    # later hash assertion refers to THIS consumed buffer, never a pathname reread.
    return json.loads(retained_bytes(path))


def immutable_input(path):
    return path == D / 'manifest.json' or D in path.parents or (E in path.parents and str(path).endswith('.json'))


'''+s[b:]
s=s.replace("prepared = json.loads(prepare.read_text())", "prepared = read(prepare)").replace("archived = json.loads(archive_record.read_text())", "archived = read(archive_record)")
s=s.replace("replacement = source.read_bytes()", "replacement = retained_bytes(source, read(D/'input-manifest.json')['helperBanks']['fixed']['sha256'])")
s=s.replace("def file_hash(path):\n    guard_leaf(path)", "def file_hash(path):\n    if immutable_input(path):\n        return hashlib.sha256(retained_bytes(path)).hexdigest()\n    guard_leaf(path)")
s=s.replace("require(file_hash(p) == 'a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae',\n            'OWNERSHIP_CORE_CHANGED')", "raw = retained_bytes(p, 'a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae')")
s=s.replace('ast.parse(p.read_text()).body','ast.parse(raw).body')
s=s.replace("    ns['bounded_capture'] = observe_capture", "    ns['bounded_capture'] = observe_capture\n    original_regular = ns['regular']\n    def bound_regular(path):\n        baseline = globals().get('BASELINE_BINDING')\n        if baseline is not None and str(path) == baseline['path']:\n            return retained_bytes(path, baseline['sha256'])\n        return original_regular(path)\n    ns['regular'] = bound_regular")
s=s.replace("    require(file_hash(E / 'hold.json') == A['holdFileSha256'], 'HOLD_BINDING_CHANGED')\n    H = read(E / 'hold.json')", "    H = read_verified(E / 'hold.json', A['holdFileSha256'])")
s=s.replace("    require('i' + str(st.st_ino) in raw.splitlines(), 'HOLDER_FD_MISSING')", "    strict_lock_fields(raw, H['wrapper']['pid'], st.st_ino, str(lock))")
s=s.replace("    require(file_hash(baseline_path) == A['candidateBaselineSha256'], 'CANDIDATE_BASELINE_CHANGED')\n    baseline = read(baseline_path)", "    baseline = read_verified(baseline_path, A['candidateBaselineSha256'])")
s=s.replace("    require(file_hash(R / H['baselinePath']) == H['baselineSha256'], 'BASELINE_CHANGED')\n    facts = C['boundary_inventory']({'baselinePath': H['baselinePath']})", "    baseline_path = R / H['baselinePath']\n    baseline_raw = retained_bytes(baseline_path, H['baselineSha256'])\n    globals()['BASELINE_BINDING'] = {'path': str(baseline_path), 'sha256': H['baselineSha256']}\n    # Imported boundary_inventory JSON consumes the exact verified buffer via regular.\n    # Also supply regular for injected/fake core namespaces without closure rewriting.\n    old_regular = C.get('regular')\n    def baseline_reader(path):\n        require(str(path) == str(baseline_path), 'UNDECLARED_BASELINE_READER_PATH')\n        return baseline_raw\n    C['regular'] = baseline_reader\n    try:\n        facts = C['boundary_inventory']({'baselinePath': H['baselinePath']})\n    finally:\n        if old_regular is not None: C['regular'] = old_regular\n        else: C.pop('regular', None)")
# Explicit root controls use supplied hashes before JSON interpretation.
s=s.replace("    require(file_hash(Path(release_path)) == release_sha, 'RELEASE_SHA_MISMATCH')\n    A = read(Path(release_path))", "    A = read_verified(Path(release_path), release_sha)")
s=s.replace("    require(file_hash(decision_path) == decision_sha, 'DECISION_SHA')\n    decision = read(decision_path)", "    decision = read_verified(decision_path, decision_sha)")
s=s.replace("            receipts[previous] = read(p)", "            require(previous in decision.get('precedingReceipts', {}), 'UNBOUND_PRECEDING_RECEIPT')\n            receipts[previous] = read_verified(p, decision['precedingReceipts'][previous])")
# Only needed predecessor receipts, not every historical receipt, enter transition evaluation.
s=s.replace("        if p.exists():\n            require(previous in decision.get('precedingReceipts', {}), 'UNBOUND_PRECEDING_RECEIPT')", "        if p.exists() and previous in decision.get('precedingReceipts', {}):\n            require(previous in decision.get('precedingReceipts', {}), 'UNBOUND_PRECEDING_RECEIPT')")
s=s.replace("if __name__ == '__main__':\n    sys.exit(main())", "if __name__ == '__main__':\n    sys.exit(bootstrap_entry('phase'))")
p.write_text(s)
