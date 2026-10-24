import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { canonical, hash, identity, insist, sameIdentity, validate } from './contracts.js';
import { GuidedStartFailure } from './diagnostics.js';
import { GuidedJournal } from './journal.js';
import { GuidedRuntime } from './runtime.js';
import { bindContextPolicy } from './policyHash.js';
/** A renewal claim must finish this long before the lease it renews ends. */
const CLAIM_MARGIN_MS = 100;
/**
 * A renewal claim abandoned locally because the lease already ends with the session and the claim margin, not the
 * 1 s / 10 s cap, set its budget. That is the session expiry arriving, not a lost lease: the expiry timers armed for
 * the same instant end the session as EXPIRED, so this stops nothing.
 */
class ClaimMarginExhausted extends Error {
    constructor() { super('LEASE_LOST'); }
}
const ACTIVE = new Set(['PREPARING', 'REPLAYING_PREFIX', 'OBSERVING', 'PROPOSING', 'ACTING', 'AWAITING_CLARIFICATION', 'FINALIZING']);
/** Assignment is a reservation, never a fabricated owner grant. Only a complete authenticated
 * worker claim acknowledgement supplies local authority, and it can only expire or stop. */
export class GuidedOwnership {
    options;
    entries = new Map();
    constructor(options) {
        this.options = options;
    }
    occupied(entry) { return entry.unconfirmed || !entry.stopped || entry.runtime?.active === true; }
    live(entry) {
        insist(!entry.stopped && Date.parse(entry.assignment.expiresAt) > Date.now(), 'CONTEXT_LOST');
        if (entry.grant)
            insist(Date.parse(entry.grant.owner.leaseExpiresAt) > Date.now(), 'LEASE_LOST');
        if (entry.runtime)
            insist(entry.runtime.accepting, 'CONTEXT_LOST');
    }
    cancelTimers(entry) {
        if (entry.renewal)
            clearTimeout(entry.renewal);
        if (entry.expiry)
            clearTimeout(entry.expiry);
        entry.renewal = null;
        entry.expiry = null;
        entry.inFlight?.abort();
        entry.inFlight = null;
    }
    invalidate(entry) { entry.stopped = true; entry.epoch++; this.cancelTimers(entry); }
    schedule(entry) {
        if (entry.renewal)
            clearTimeout(entry.renewal);
        if (entry.expiry)
            clearTimeout(entry.expiry);
        const lease = Date.parse(entry.grant?.owner.leaseExpiresAt ?? entry.assignment.expiresAt), expires = Date.parse(entry.assignment.expiresAt);
        const remaining = Math.min(lease, expires) - Date.now();
        // Decided from the instants, not from the clock when the timer fires (see GuidedRuntime.endReason): a lease is capped at the session expiry, and a tie is the expiry.
        const reason = expires <= lease ? 'EXPIRED' : 'LEASE_LOST';
        entry.expiry = setTimeout(() => { void this.stopEntry(entry, reason).catch(() => undefined); }, Math.max(0, remaining));
        entry.expiry.unref();
        if (entry.grant) {
            const secretContext = entry.runtime?.hasSecretInputs === true;
            if (secretContext)
                entry.nextRenewal ??= Date.now() + 1000;
            entry.renewal = setTimeout(() => { void this.renew(entry); }, secretContext ? Math.max(1, (entry.nextRenewal ?? Date.now()) - Date.now()) : Math.max(1, Math.min(10_000, Math.floor(remaining / 3))));
            entry.renewal.unref();
        }
    }
    checkGrant(entry, value, initial) {
        const grant = validate('session', value);
        const intent = entry.assignment;
        insist(ACTIVE.has(grant.state), 'CONTEXT_LOST');
        insist(grant.sessionId === intent.sessionId && grant.scopeHash === intent.scopeHash && hash(grant.scope) === intent.scopeHash && grant.scope.sourceRevision === intent.sourceRevision && grant.scope.configurationRevision === intent.configurationRevision && canonical(grant.versions) === canonical(intent.versions) && grant.expiresAt === intent.expiresAt, 'IDENTITY_MISMATCH');
        insist(grant.owner.workerId === intent.workerId && grant.owner.fence === (initial ? intent.expectedFence + 1 : entry.grant?.owner.fence), 'IDENTITY_MISMATCH');
        const lease = Date.parse(grant.owner.leaseExpiresAt), now = Date.now();
        const created = Date.parse(grant.createdAt), expires = Date.parse(grant.expiresAt);
        insist(created <= now && expires > created && expires - created <= grant.limits.maxSessionSeconds * 1000 && grant.sourceSteps.length <= grant.limits.maxSourceSteps && new Set(grant.sourceSteps.map(step => step.stepId)).size === grant.sourceSteps.length && grant.runAuthorization.scopeHash === grant.scopeHash && grant.runAuthorization.principalId === grant.scope.principalId, 'IDENTITY_MISMATCH');
        insist(lease > now && lease <= Date.parse(intent.expiresAt) && lease <= now + 30_000, 'LEASE_LOST');
        if (!initial && entry.grant) {
            const previous = Date.parse(entry.grant.owner.leaseExpiresAt);
            insist(lease > previous || lease === previous && lease === Date.parse(intent.expiresAt), 'LEASE_LOST');
            insist(canonical(grant.limits) === canonical(entry.grant.limits) && canonical(grant.sourceSteps) === canonical(entry.grant.sourceSteps), 'IDENTITY_MISMATCH');
        }
        return structuredClone(grant);
    }
    async requestClaim(entry, initial, phaseEnd) {
        this.live(entry);
        insist(!entry.inFlight, 'BUSY');
        const epoch = entry.epoch;
        const lease = Date.parse(entry.grant?.owner.leaseExpiresAt ?? entry.assignment.expiresAt);
        const cap = entry.runtime?.hasSecretInputs ? 1000 : 10_000, now = Date.now(), budget = lease - now - CLAIM_MARGIN_MS;
        const phaseBudget = phaseEnd === undefined ? Infinity : phaseEnd - now;
        if (phaseBudget <= 0)
            throw new Error('LEASE_LOST');
        // Fixed from the instants at claim start, never from a latency constant: with the lease at the expiry, a claim the margin bounds is cut at E - margin by construction.
        // Cadence ties end as LEASE_LOST; only a strictly earlier session-lease margin may defer to EXPIRED.
        const marginBound = lease >= Date.parse(entry.assignment.expiresAt) && budget < cap && budget < phaseBudget;
        const lost = () => marginBound && (phaseEnd === undefined || Date.now() < phaseEnd) ? new ClaimMarginExhausted() : new Error('LEASE_LOST');
        const timeout = Math.min(cap, budget, phaseBudget);
        if (timeout <= 0)
            throw lost();
        const controller = new AbortController();
        entry.inFlight = controller;
        const timer = setTimeout(() => { controller.abort(); }, timeout);
        timer.unref();
        let abortListener;
        const aborted = new Promise((_resolve, reject) => { abortListener = () => { reject(lost()); }; controller.signal.addEventListener('abort', abortListener, { once: true }); });
        try {
            const command = { schemaVersion: 3, sessionId: entry.assignment.sessionId, workerId: this.options.workerId, expectedFence: initial ? entry.assignment.expectedFence : entry.grant?.owner.fence ?? -1, versions: entry.assignment.versions };
            const result = await Promise.race([this.options.claim(command, randomUUID(), timeout, controller.signal), aborted]);
            insist(!entry.stopped && entry.epoch === epoch, 'CONTEXT_LOST');
            this.live(entry);
            return this.checkGrant(entry, result, initial);
        }
        finally {
            clearTimeout(timer);
            if (abortListener)
                controller.signal.removeEventListener('abort', abortListener);
            if (entry.inFlight === controller)
                entry.inFlight = null;
        }
    }
    async acquire(entry) {
        try {
            let marker;
            try {
                marker = await GuidedJournal.open(join(this.options.journalDirectory, 'assignments'), entry.assignment.sessionId);
            }
            catch (cause) {
                entry.unconfirmed = true;
                throw new Error('CONTEXT_LOST', { cause });
            }
            await marker.consume(entry.assignment);
            this.live(entry);
            const grant = await this.requestClaim(entry, true);
            this.live(entry);
            entry.grant = grant;
            this.schedule(entry);
        }
        catch (cause) {
            if (entry.unconfirmed)
                this.invalidate(entry);
            else
                await this.stopEntry(entry, 'CONTEXT_LOST');
            throw new Error('CONTEXT_LOST', { cause });
        }
    }
    async assign(value) {
        const assignment = validate('assignment', value);
        insist(assignment.workerId === this.options.workerId, 'IDENTITY_MISMATCH');
        const digest = hash(assignment);
        let entry = this.entries.get(assignment.sessionId);
        if (entry) {
            insist(entry.digest === digest, 'IDEMPOTENCY_CONFLICT');
            this.live(entry);
            await entry.initial;
            this.live(entry);
            return this.receipt(entry);
        }
        insist(Date.parse(assignment.expiresAt) > Date.now() && Date.parse(assignment.expiresAt) - Date.now() <= 600_000, 'EXPIRED');
        insist(this.entries.size < 10000 && [...this.entries.values()].filter(item => this.occupied(item)).length < (this.options.capacity ?? 1), 'CAPACITY');
        entry = { assignment: structuredClone(assignment), digest, grant: null, runtime: null, policy: null, contextStart: null, stopped: false, unconfirmed: false, epoch: 0, initial: Promise.resolve(), renewal: null, expiry: null, inFlight: null, stopping: null };
        this.entries.set(assignment.sessionId, entry);
        this.schedule(entry);
        entry.initial = this.acquire(entry);
        await entry.initial;
        this.live(entry);
        return this.receipt(entry);
    }
    receipt(entry) {
        return { schemaVersion: 3, assignment: structuredClone(entry.assignment), status: entry.stopped ? 'STOPPED' : 'OWNED', ownerFence: entry.grant?.owner.fence ?? null, leaseExpiresAt: entry.grant?.owner.leaseExpiresAt ?? null };
    }
    async renew(entry) {
        try {
            this.live(entry);
            let phaseEnd;
            if (entry.runtime?.hasSecretInputs === true) {
                insist(entry.nextRenewal !== undefined, 'LEASE_LOST');
                phaseEnd = entry.nextRenewal + 1000;
            }
            const grant = await this.requestClaim(entry, false, phaseEnd);
            this.live(entry);
            // The same captured phase still bounds a validated reply after await, immediately before authority installation.
            if (phaseEnd !== undefined)
                insist(Date.now() < phaseEnd, 'LEASE_LOST');
            entry.runtime?.applyAcknowledgedLease(grant.owner.leaseExpiresAt);
            entry.grant = grant;
            if (entry.nextRenewal !== undefined)
                entry.nextRenewal += 1000;
            this.schedule(entry);
        }
        catch (error) {
            // C-1: the lease cannot be extended past the expiry, and the margin ran out before the claim could finish. The expiry timers end the session as EXPIRED at E; backend refusals (REVOKED, denied, grant checks) still stop at once.
            if (error instanceof ClaimMarginExhausted)
                return;
            await this.stopEntry(entry, error instanceof Error && error.message === 'REVOKED' ? 'REVOKED' : 'LEASE_LOST').catch(() => undefined);
        }
    }
    getRuntime(message) {
        const entry = this.entries.get(message.sessionId);
        insist(entry?.runtime && sameIdentity(entry.runtime.currentIdentity, message), 'IDENTITY_MISMATCH');
        this.live(entry);
        return entry.runtime;
    }
    async context(value, deliveryId) {
        const context = validate('runner-context', value);
        const entry = this.entries.get(context.sessionId);
        insist(entry?.grant, 'CONTEXT_LOST');
        this.live(entry);
        const grant = entry.grant, intent = entry.assignment;
        insist(context.workerId === intent.workerId && context.ownerFence === grant.owner.fence && context.scopeHash === intent.scopeHash && context.sourceRevision === intent.sourceRevision && context.configurationRevision === intent.configurationRevision && context.expiresAt === intent.expiresAt && canonical(context.versions) === canonical(intent.versions) && canonical(context.approvedOrigins) === canonical(grant.scope.approvedOrigins) && canonical(context.sourceStepIds) === canonical(grant.sourceSteps.map(step => step.stepId)) && canonical(context.limits) === canonical(grant.limits) && Date.parse(context.leaseExpiresAt) <= Date.parse(intent.expiresAt), 'IDENTITY_MISMATCH');
        // AR-2: the policy comes only from the backend-frozen context and is applied only if its hash
        // matches, before the first observation; a later context cannot change it.
        const policy = bindContextPolicy(context, entry.policy ?? undefined);
        // Context delivery races renewal: its timestamp is informational, never local authority.
        const authorized = structuredClone(context);
        if (entry.runtime) {
            await entry.contextStart;
            this.live(entry);
            return entry.runtime.update(authorized, deliveryId);
        }
        entry.policy = policy;
        entry.runtime = new GuidedRuntime(authorized, { ...this.options, applicationPolicy: policy.applicationPolicy, capabilities: grant.scope.capabilities, csiId: grant.scope.csiId, onStopping: () => { this.invalidate(entry); } });
        entry.runtime.setLiveLease(grant.owner.leaseExpiresAt);
        entry.contextStart = entry.runtime.start();
        this.schedule(entry);
        try {
            await entry.contextStart;
            this.live(entry);
            return identity(context);
        }
        catch (cause) {
            const { phase, loss } = entry.runtime.startFailure;
            // A stop that cannot confirm the browser is gone (a survivor, a hung launcher) keeps the slot held; it must not hide why the start failed.
            await this.stopEntry(entry, 'CONTEXT_LOST').catch(() => undefined);
            throw new GuidedStartFailure(phase, loss, cause);
        }
    }
    async stopEntry(entry, reason) {
        insist(!entry.unconfirmed, 'CONTEXT_LOST');
        if (entry.stopping)
            return entry.stopping;
        this.invalidate(entry);
        const stop = async () => {
            if (entry.runtime)
                await entry.runtime.stop(reason);
            else
                await this.options.callback('lifecycle', { schemaVersion: 3, kind: 'assignment', assignment: entry.assignment, reason }).catch(() => undefined);
            // Keep only the value-free scoped receipt, not workflow snapshots or live context state.
        };
        entry.stopping = Promise.resolve().then(stop);
        return entry.stopping;
    }
    async stop(value) {
        const message = validate('bridge', value, 'stop');
        if ('kind' in message) {
            const stop = message;
            insist(stop.assignment.workerId === this.options.workerId, 'IDENTITY_MISMATCH');
            let entry = this.entries.get(stop.assignment.sessionId);
            if (!entry) {
                insist(this.entries.size < 10000, 'CAPACITY');
                entry = { assignment: structuredClone(stop.assignment), digest: hash(stop.assignment), grant: null, runtime: null, policy: null, contextStart: null, stopped: true, unconfirmed: false, epoch: 0, initial: Promise.resolve(), renewal: null, expiry: null, inFlight: null, stopping: null };
                this.entries.set(stop.assignment.sessionId, entry);
                try {
                    const marker = await GuidedJournal.open(join(this.options.journalDirectory, 'assignments'), stop.assignment.sessionId);
                    await marker.consume(stop.assignment);
                }
                catch {
                    entry.unconfirmed = true;
                    throw new Error('CONTEXT_LOST');
                }
            }
            insist(entry.digest === hash(stop.assignment), 'IDENTITY_MISMATCH');
            await this.stopEntry(entry, stop.reason);
            return this.receipt(entry);
        }
        const entry = this.entries.get(message.sessionId);
        insist(entry?.runtime && sameIdentity(entry.runtime.currentIdentity, message), 'IDENTITY_MISMATCH');
        await this.stopEntry(entry, message.reason);
        return identity(message);
    }
    async close() {
        const results = await Promise.allSettled([...this.entries.values()].map(entry => this.stopEntry(entry, 'CONTEXT_LOST')));
        // STUDIO-OBS-013: a drain waits for each session recording to settle (bounded; never rejects).
        await Promise.all([...this.entries.values()].map(entry => entry.runtime?.recordingSettled ?? Promise.resolve()));
        if (results.some(result => result.status === 'rejected'))
            throw new Error('CONTEXT_LOST');
    }
}
//# sourceMappingURL=ownership.js.map