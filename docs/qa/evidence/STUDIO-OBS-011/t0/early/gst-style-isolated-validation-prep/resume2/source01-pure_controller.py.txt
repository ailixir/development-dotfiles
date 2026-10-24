"""Inactive source-only GST controller. No imports, CLI, filesystem or native fallback.

All effects require an independently reviewed ordinary Port implementation, currently OWED.
Use externally verified unit-plan bytes and source bytes, never caller-selected path discovery.
"""

class Hold(Exception):
    pass


def require(condition, reason):
    if not condition:
        raise Hold(reason)


def integer(value):
    return type(value) is int


def sha(value):
    return isinstance(value, str) and len(value) == 64 and all(c in '0123456789abcdef' for c in value)


def closed(value, keys):
    return type(value) is dict and set(value) == set(keys)


def inventory(rows, expected, modes):
    require(type(rows) is list and len(rows) == len(expected), 'INVENTORY_MEMBERS')
    actual = {}
    for row in rows:
        require(closed(row, ('path', 'sha256', 'mode')), 'INVENTORY_SCHEMA')
        path = row['path']
        require(type(path) is str and path not in actual and sha(row['sha256']), 'INVENTORY_DUPLICATE_OR_DIGEST')
        require(integer(row['mode']) and 0 <= row['mode'] <= 0o7777, 'INVENTORY_MODE')
        actual[path] = row
    require(set(actual) == {row['path'] for row in expected}, 'INVENTORY_PATHS')
    for row in expected:
        require(actual[row['path']]['sha256'] == row['sha256'] and actual[row['path']]['mode'] == modes[row['path']], 'INVENTORY_DRIFT')
    return actual


class OwedPort:
    """Deliberately no ordinary adapter. Nothing here probes a path or launches a child."""
    def __getattr__(self, name):
        raise Hold('ORDINARY_ADAPTER_OWED')


class Controller:
    DECISION_KEYS = ('unit', 'phase', 'principal', 'sequence', 'previousReceipt', 'planSha256', 'approvalSha256')
    PHASES = ('prepare', 'format', 'verify', 'regression', 'archive', 'final', 'gate', 'postclose')

    def __init__(self, plan, plan_sha, port=None):
        require(sha(plan_sha), 'PLAN_PIN')
        self.plan, self.plan_sha = plan, plan_sha
        self.port = port if port is not None else OwedPort()
        self.unit = plan['label']
        self.roots = plan['roots']
        self.caps = {phase: 0 for phase in self.PHASES}
        self.state = 'NEW'
        self.hold = False
        self.receipts = []
        self.last = None
        self.modes = None
        self.project = None
        self.pending_review = None
        self.final_status = None
        self.gate_status = None
        self.approved = None
        self.sequence = 0
        self._validate_plan()

    def _validate_plan(self):
        p = self.plan
        r = self.roots
        require(p['pathExistenceOrCurrentHolderObserved'] is False, 'NO_CURRENT_PROOF_IN_PLAN')
        require(r['projectP'] == r['ownedW'] + '/repo' and r['control'] == r['ownedW'] + '/control', 'ROOT_MAP')
        require(r['evidenceE'].startswith(r['sharedAcceptedR'] + '/docs/qa/evidence/STUDIO-OBS-011/t0/runtime/'), 'EVIDENCE_ROOT')
        rows = p['finiteCopy']['members']
        require(len(rows) == 2092 and len({x['path'] for x in rows}) == 2092, 'FINITE2092')
        require(sum(x['mode'] is None for x in rows) == 284, 'EXACT_UNKNOWN_MODES')
        require(sum(x['origin'] == 'SOURCE1808' for x in rows) == 1808, 'SOURCE1808')
        for row in rows:
            name = row['path']
            require(type(name) is str and not name.startswith('/') and all(x not in ('', '.', '..', '.git', 'node_modules') for x in name.split('/')), 'FINITE_PATH')
            require(sha(row['sha256']), 'FINITE_DIGEST')
        require(len(p['overlay']) == 3 and len({x['path'] for x in p['overlay']}) == 3, 'OVERLAY3')
        for row in p['overlay']:
            source = next((x for x in rows if x['path'] == row['path']), None)
            require(source is not None and source['sha256'] == row['preimageSha256'] and source['mode'] == row['mode'] == 0o644, 'OVERLAY_PREIMAGE')
        native = {x['id']: x for x in p['phases'] if x['id'] in ('format', 'verify', 'regression')}
        require({x: native[x]['acceptanceDeadlineSeconds'] for x in native} == {'format': 900, 'verify': 3600, 'regression': 7200}, 'DEADLINES')
        require(len(native['regression']['caseCatalog']) == 99 and len(native['regression']['classCounts']) == 5, 'CATALOG99')
        require(p['wrapper']['oldHoldReuse'] is False and p['closure']['cleanupAuthorized'] is False, 'NO_BORROW_OR_CLEANUP')

    def _decision(self, phase, raw, raw_sha):
        require(sha(raw_sha), 'DECISION_PIN')
        decision = self.port.verify_control(raw, raw_sha)
        require(closed(decision, self.DECISION_KEYS), 'DECISION_SCHEMA')
        require(decision['unit'] == self.unit and decision['phase'] == phase and decision['principal'] == 'root', 'DECISION_SUBJECT')
        require(decision['sequence'] == self.sequence + 1 and integer(decision['sequence']), 'DECISION_SEQUENCE')
        require(decision['previousReceipt'] == self.last and decision['planSha256'] == self.plan_sha and sha(decision['approvalSha256']), 'DECISION_CHAIN')
        self.port.verify_approval(decision['approvalSha256'], phase, self.project)
        self.sequence += 1

    def _gates(self):
        facts = self.port.admission(self.roots, self.plan_sha)
        keys = ('unit', 'gatewayClosedQaRoot', 'noncreditCertificate', 'preF1', 'nonIR', 'ordinaryOwnershipQualified', 'newGuardNegativeStatus', 'sameHolderQualified', 'oneHeavyWrapperSha256', 'lease', 'tools', 'offline', 'fixture', 'sourceModes', 'sourceModesFresh')
        require(closed(facts, keys) and facts['unit'] == self.unit, 'ADMISSION_SCHEMA')
        for name in ('gatewayClosedQaRoot', 'noncreditCertificate', 'preF1', 'nonIR', 'ordinaryOwnershipQualified', 'sameHolderQualified', 'sourceModesFresh'):
            require(facts[name] is True, 'ADMISSION_' + name)
        require(type(facts['newGuardNegativeStatus']) is int and facts['newGuardNegativeStatus'] == 1, 'GUARD_NEGATIVE')
        require(facts['oneHeavyWrapperSha256'] == self.plan['wrapper']['sha256'], 'WRAPPER_PIN')
        lease = facts['lease']
        require(closed(lease, ('exclusive', 'start', 'expires', 'destinationHashes', 'ownedRoots', 'noSharedWrites')), 'LEASE_SCHEMA')
        now = self.port.monotonic_lease_time()
        require(integer(now) and integer(lease['start']) and integer(lease['expires']) and 0 < lease['expires'] - lease['start'] <= 43200 and lease['start'] <= now < lease['expires'], 'LEASE_EXPIRED')
        require(lease['exclusive'] is True and lease['noSharedWrites'] is True and lease['ownedRoots'] == self.roots, 'LEASE_BINDINGS')
        current = {x['path']: x['sha256'] for x in self.project} if self.project is not None else {}
        expected = {self.roots['projectP'] + '/' + x['path']: current.get(x['path'], x['candidateSha256']) for x in self.plan['overlay']}
        require(lease['destinationHashes'] == expected, 'LEASE_DESTINATIONS')
        tools = facts['tools']
        require(closed(tools, ('fresh', 'java21', 'javaBinSha256', 'javaReleaseSha256', 'caffeinateSha256', 'allUtilitiesQualified', 'gradle8102PropertyCompatibility')), 'TOOL_SCHEMA')
        for key in ('fresh', 'java21', 'allUtilitiesQualified', 'gradle8102PropertyCompatibility'):
            require(tools[key] is True, 'TOOL_UNQUALIFIED')
        require(tools['javaBinSha256'] == self.plan['java']['binarySha256'] and tools['javaReleaseSha256'] == self.plan['java']['releaseSha256'] and sha(tools['caffeinateSha256']), 'TOOL_PIN')
        offline = facts['offline']
        require(closed(offline, ('manifestSha256', 'closureQualified', 'version', 'finiteOwnedSeed', 'noCredentialsOrInitOrDaemonOrRegistry', 'readOnlyOriginal')), 'OFFLINE_SCHEMA')
        require(sha(offline['manifestSha256']) and offline['version'] == '8.10.2', 'OFFLINE_SEED')
        for key in ('closureQualified', 'finiteOwnedSeed', 'noCredentialsOrInitOrDaemonOrRegistry', 'readOnlyOriginal'):
            require(offline[key] is True, 'OFFLINE_CLOSURE')
        fixture = facts['fixture']
        require(closed(fixture, ('fresh', 'imageId', 'platform', 'literalResolutionQualified', 'javaFixtureQualified', 'unchangedSkipRyukPolicy')), 'FIXTURE_SCHEMA')
        require(fixture['imageId'] == self.plan['fixture']['parentSuppliedImageId'] and fixture['platform'] == 'linux/arm64', 'FIXTURE_PIN')
        for key in ('fresh', 'literalResolutionQualified', 'javaFixtureQualified', 'unchangedSkipRyukPolicy'):
            require(fixture[key] is True, 'FIXTURE_QUALIFICATION')
        modes = facts['sourceModes']
        rows = self.plan['finiteCopy']['members']
        require(type(modes) is dict and set(modes) == {x['path'] for x in rows}, 'MODE_COMPLETE')
        for row in rows:
            mode = modes[row['path']]
            require(integer(mode) and 0 <= mode <= 0o7777 and (row['mode'] is None or row['mode'] == mode), 'MODE_UNKNOWN_OR_CHANGED')
        if self.modes is not None:
            require(modes == self.modes, 'MODE_BINDING_CHANGED')
        self.modes = dict(modes)
        inventory(self.port.inventory('R', self.roots, rows), rows, modes)
        self.port.verify_ordinary_ownership(self.roots)
        if self.project is not None:
            inventory(self.port.inventory('P', self.roots, self.project), self.project, modes)

    def _receipt(self, phase, primary, cleanup, result):
        receipt = {'unit': self.unit, 'phase': phase, 'sequence': self.sequence, 'primary': primary, 'cleanup': cleanup, 'accepted': primary is None and not cleanup, 'state': self.state, 'nativeStatus': result.get('nativeStatus') if type(result) is dict and integer(result.get('nativeStatus')) else None, 'phaseStatus': 0 if primary is None and not cleanup else 1, 'hold': self.hold, 'sourceApplyOrCredit': False}
        try:
            self.last = self.port.publish_receipt(receipt)
            require(sha(self.last), 'RECEIPT_PIN')
        except BaseException:
            self.hold = True
            self.state = 'HOLD'
            self.last = None
            receipt['cleanup'] = list(cleanup) + ['RECEIPT_PUBLICATION_UNKNOWN']
            receipt.update(accepted=False, state='HOLD', phaseStatus=1, hold=True)
        self.receipts.append(receipt)
        return receipt

    def invoke(self, phase, raw_decision, decision_sha):
        require(phase in self.PHASES and phase not in ('gate', 'postclose'), 'PHASE')
        require(self.caps[phase] == 0 and not self.hold, 'CAP_OR_HOLD')
        self.caps[phase] = 1  # consumed even reserve/setup/launch/parse failure
        primary = None
        cleanup = []
        result = None
        try:
            self.port.reserve_phase(self.unit, phase, self.plan_sha)  # exclusive durable start before setup
            self._decision(phase, raw_decision, decision_sha)
            allowed = {'prepare': 'NEW', 'format': 'PREPARED', 'verify': 'FORMATTED', 'regression': 'VERIFIED', 'archive': 'REGRESSION_OK', 'final': 'ARCHIVED'}
            require(self.state == allowed[phase] and self.pending_review is None, 'PHASE_ORDER_OR_REVIEW')
            self._gates()
            if phase == 'prepare':
                self.port.prepare_copy(self.roots, self.plan['finiteCopy']['members'], self.modes, self.plan['overlay'])
                targets = {x['path']: x['candidateSha256'] for x in self.plan['overlay']}
                self.project = [dict(x, sha256=targets.get(x['path'], x['sha256'])) for x in self.plan['finiteCopy']['members']]
                self._gates()
                self.state = 'PREPARED'
            elif phase in ('format', 'verify', 'regression'):
                spec = next(x for x in self.plan['phases'] if x['id'] == phase)
                result = self.port.native(spec, self.roots)  # owned wait/drain is mandatory within port
                self._native_result(result, spec)
                if phase == 'format':
                    after = self.port.inventory('P', self.roots, self.project)
                    require(type(after) is list and len(after) == len(self.project), 'FORMAT_INVENTORY')
                    bypath = {x['path']: x for x in after if type(x) is dict and 'path' in x}
                    require(len(bypath) == len(self.project), 'FORMAT_DUPLICATES')
                    changed = []
                    targets = {x['path'] for x in self.plan['overlay']}
                    for row in self.project:
                        actual = bypath.get(row['path'])
                        require(closed(actual, ('path', 'sha256', 'mode')) and sha(actual['sha256']) and actual['mode'] == self.modes[row['path']] and integer(actual['mode']), 'FORMAT_SCHEMA_MODE')
                        if actual['sha256'] != row['sha256']:
                            require(row['path'] in targets, 'FORMAT_NONTARGET_DRIFT')
                            changed.append(actual)
                    if changed:
                        self.pending_review = changed
                        self.state = 'FORMAT_REVIEW_REQUIRED'
                    else:
                        self.state = 'FORMATTED'
                elif phase == 'verify':
                    self.port.verify_style_reports(self.roots, spec['requiredTasks'])
                    self.state = 'VERIFIED'
                else:
                    self.port.verify_regression(self.roots, spec['caseCatalog'], spec['expectedCounts'], require_exec=True)
                    self.state = 'REGRESSION_OK'
                # Format target changes are deliberately withheld from accepted project until review.
                inventory(self.port.inventory('R', self.roots, self.plan['finiteCopy']['members']), self.plan['finiteCopy']['members'], self.modes)
                self.port.verify_ordinary_ownership(self.roots)
                if not self.pending_review:
                    self._gates()
            elif phase == 'archive':
                self.port.archive_exact(self.roots, self.project, self.receipts, self.plan_sha)
                self._gates()
                self.state = 'ARCHIVED'
            elif phase == 'final':
                self.port.verify_archive_qa_root(self.roots, self.last)
                self.port.final_probe(self.roots, self.project)
                self._gates()
                self.state = 'FINAL_OK'
        except BaseException as error:
            primary = error.args[0] if type(error) is Hold and error.args and type(error.args[0]) is str and error.args[0] in REASONS else 'PHASE_EXCEPTION'
            self.hold = True
            self.state = 'HOLD'
        finally:
            try:
                self.port.finish_phase(self.unit, phase)  # must never return unresolved native child
            except BaseException:
                cleanup.append('OWNERSHIP_FINISH_UNKNOWN')
                self.hold = True
                self.state = 'HOLD'
            if self.modes is not None:
                try:
                    inventory(self.port.inventory('R', self.roots, self.plan['finiteCopy']['members']), self.plan['finiteCopy']['members'], self.modes)
                except BaseException:
                    cleanup.append('FINAL_R_SOURCE_UNKNOWN')
                    self.hold = True
                    self.state = 'HOLD'
        return self._receipt(phase, primary, cleanup, result)

    def adopt_formatted(self, raw, raw_sha):
        require(self.state == 'FORMAT_REVIEW_REQUIRED' and self.pending_review is not None and not self.hold, 'NO_PENDING_FORMAT_REVIEW')
        self._decision('formatted-source-review', raw, raw_sha)
        self.port.verify_formatted_aria_qa_root(self.pending_review)
        hashes = {x['path']: x['sha256'] for x in self.pending_review}
        self.project = [dict(x, sha256=hashes.get(x['path'], x['sha256'])) for x in self.project]
        self.port.verify_lease_amendment_without_extension(self.project, self.roots)
        self.pending_review = None
        self.state = 'FORMATTED'
        self._gates()

    def status(self, phase, status, receipt_sha):
        require(phase in ('final', 'gate') and integer(status) and status == 0 and receipt_sha == self.last, 'SEPARATE_STATUS')
        require(self.receipts[-1]['phase'] == phase and self.receipts[-1]['accepted'] is True, 'SEPARATE_STATUS_SUBJECT')
        self.port.verify_separate_status(phase, status, receipt_sha)
        if phase == 'final':
            self.final_status = receipt_sha
        else:
            self.gate_status = receipt_sha

    def guarded_gate(self, raw, pin, permit, permit_pin):
        require(self.caps['gate'] == 0 and self.state == 'FINAL_OK' and self.final_status == self.last and not self.hold, 'FINAL_STATUS_INSPECTION_REQUIRED')
        self.caps['gate'] = 1
        return self._closing('gate', lambda: self._gate_inner(raw, pin, permit, permit_pin))

    def _closing(self, phase, operation):
        primary = None
        cleanup = []
        try:
            operation()
        except BaseException:
            primary = 'CLOSING_PROOF_UNKNOWN'
            self.hold = True
            self.state = 'HOLD'
        finally:
            try:
                self.port.finish_phase(self.unit, phase)
            except BaseException:
                cleanup.append('OWNERSHIP_FINISH_UNKNOWN')
                self.hold = True
                self.state = 'HOLD'
        return self._receipt(phase, primary, cleanup, None)

    def _gate_inner(self, raw, pin, permit, permit_pin):
        self.port.reserve_phase(self.unit, 'gate', self.plan_sha)
        self._decision('gate', raw, pin)
        self.port.verify_final_inspection(self.last)
        self._gates()
        control = self.port.verify_control(permit, permit_pin)
        require(closed(control, ('unit', 'principal', 'finalReceipt', 'issued', 'expires', 'exitStatus')), 'PERMIT_SCHEMA')
        require(control['unit'] == self.unit and control['principal'] == 'root' and control['finalReceipt'] == self.final_status and integer(control['exitStatus']) and control['exitStatus'] == 0, 'PERMIT_BINDING')
        require(integer(control['issued']) and integer(control['expires']) and control['expires'] - control['issued'] == 60, 'PERMIT_INTERVAL')
        for when in ('PRE', 'POST'):
            now = self.port.monotonic_lease_time()
            require(integer(now) and control['issued'] <= now < control['expires'], 'PERMIT_STALE')
            self.port.gate_probe(when, self.roots, self.project, self.final_status)
            self._gates()
        self.state = 'GATE_OK'

    def postclose(self, raw, pin):
        require(self.caps['postclose'] == 0 and self.state == 'GATE_OK' and self.gate_status == self.last and not self.hold, 'GATE_STATUS_REQUIRED')
        self.caps['postclose'] = 1
        return self._closing('postclose', lambda: self._postclose_inner(raw, pin))

    def _postclose_inner(self, raw, pin):
        self.port.reserve_phase(self.unit, 'postclose', self.plan_sha)
        self._decision('postclose', raw, pin)
        self.port.verify_actual_wrapper_zero_and_outer_postclose(self.roots)
        self.port.verify_postclose_absence_reuse_free_original_inode(self.roots)
        inventory(self.port.inventory('R', self.roots, self.plan['finiteCopy']['members']), self.plan['finiteCopy']['members'], self.modes)
        self.port.verify_postclose_qa_root(self.roots)
        self.state = 'CLOSED_RESOURCE_ONLY'

    def _native_result(self, result, spec):
        keys = ('nativeStatus', 'collectorStatus', 'phaseStatus', 'elapsedSeconds', 'firstChildIdentityQualified', 'allOwnedWaited', 'utilityRosterComplete', 'stickyUnknown', 'outputCustodyQualified')
        require(closed(result, keys), 'NATIVE_SCHEMA')
        for key in ('nativeStatus', 'collectorStatus', 'phaseStatus'):
            require(integer(result[key]) and result[key] == 0, 'NATIVE_NONZERO_OR_UNKNOWN')
        require(integer(result['elapsedSeconds']) and 0 <= result['elapsedSeconds'] <= spec['acceptanceDeadlineSeconds'], 'ACCEPTANCE_DEADLINE')
        for key in ('firstChildIdentityQualified', 'allOwnedWaited', 'utilityRosterComplete', 'outputCustodyQualified'):
            require(result[key] is True, 'NATIVE_OWNERSHIP_UNKNOWN')
        require(result['stickyUnknown'] is False, 'NATIVE_STICKY_UNKNOWN')


# Only closed literal reasons enter public receipts. Never exception text, paths, logs or stack.
REASONS = frozenset(('PHASE_EXCEPTION', 'ORDINARY_ADAPTER_OWED', 'NATIVE_SCHEMA', 'NATIVE_NONZERO_OR_UNKNOWN', 'NATIVE_OWNERSHIP_UNKNOWN', 'NATIVE_STICKY_UNKNOWN', 'ACCEPTANCE_DEADLINE', 'LEASE_EXPIRED', 'MODE_UNKNOWN_OR_CHANGED', 'OFFLINE_CLOSURE', 'INVENTORY_DRIFT', 'FORMAT_NONTARGET_DRIFT', 'PHASE_ORDER_OR_REVIEW'))
