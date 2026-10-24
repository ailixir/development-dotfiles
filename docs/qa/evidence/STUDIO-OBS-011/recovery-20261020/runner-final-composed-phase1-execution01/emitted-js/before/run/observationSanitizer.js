import { createHash } from 'node:crypto';
/** canonical-v1, matching the frozen contract's non-ASCII vector. */
export function canonicalObservation(value) {
    if (typeof value === 'string') {
        if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))
            throw new Error('INVALID_UNICODE');
        return JSON.stringify(value);
    }
    if (value === null || typeof value === 'boolean')
        return JSON.stringify(value);
    if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0))
        return String(value);
    if (Array.isArray(value))
        return `[${value.map(canonicalObservation).join(',')}]`;
    if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
        throw new Error('INVALID_CONTRACT');
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${canonicalObservation(key)}:${canonicalObservation(item)}`).join(',')}}`;
}
export function observationOptions(config) {
    canonicalObservation(config);
    const validText = (value) => value.length > 0 && Array.from(value).length <= 256;
    if (!validText(config.sessionId) || !/^[a-f0-9]{64}$/u.test(config.scopeHash) || config.rules.length > 500 || config.knownSecrets.length > 64 || config.knownSecrets.some(secret => secret.length > 4096))
        throw new Error('INVALID_CONTRACT');
    if (!config.approvedOrigins.length || config.approvedOrigins.length > 64 || config.approvedOrigins.some(origin => {
        try {
            const url = new URL(origin);
            return !['http:', 'https:'].includes(url.protocol) || url.origin !== origin || origin.length > 256;
        }
        catch {
            return true;
        }
    }))
        throw new Error('INVALID_CONTRACT');
    if (config.applicationPolicy && (!validText(config.applicationPolicy.policyRuleId) || !config.applicationPolicy.allowStructuralDiscovery))
        throw new Error('INVALID_CONTRACT');
    const grants = config.applicationPolicy?.readGrants ?? [];
    if (grants.length > 32)
        throw new Error('INVALID_CONTRACT');
    const grantIds = new Set();
    for (const grant of grants) {
        if (!validText(grant.policyRuleId) || grantIds.has(grant.policyRuleId) || !config.approvedOrigins.includes(grant.origin) || (!grant.visibleText && !grant.controlValue))
            throw new Error('INVALID_CONTRACT');
        const closed = (value, keys) => Object.keys(value).every(key => keys.includes(key));
        if (!closed(grant, ['policyRuleId', 'origin', 'region', 'visibleText', 'controlValue']) || !closed(grant.region, grant.region.kind === 'role' ? ['kind', 'role', 'name', 'exact'] : ['kind']) || (grant.visibleText && !closed(grant.visibleText, ['classification'])) || (grant.controlValue && !closed(grant.controlValue, ['classification', 'types'])))
            throw new Error('INVALID_CONTRACT');
        grantIds.add(grant.policyRuleId);
        if (grant.region.kind === 'role' && (!['main', 'region', 'form'].includes(grant.region.role) || !validText(grant.region.name) || grant.region.exact !== true))
            throw new Error('INVALID_CONTRACT');
        if (!['application', 'role'].includes(grant.region.kind))
            throw new Error('INVALID_CONTRACT');
        if (grant.visibleText && grant.visibleText.classification !== 'permittedBusinessData')
            throw new Error('INVALID_CONTRACT');
        if (grant.controlValue && (grant.controlValue.classification !== 'nonsecretApproved' || !grant.controlValue.types.length || grant.controlValue.types.length > 6 || new Set(grant.controlValue.types).size !== grant.controlValue.types.length || grant.controlValue.types.some(type => !['text', 'search', 'email', 'tel', 'url', 'textarea'].includes(type))))
            throw new Error('INVALID_CONTRACT');
    }
    const ids = new Set();
    for (const rule of config.rules) {
        if (ids.has(rule.testId) || ![rule.testId, rule.name, rule.policyRuleId].every(validText) || (rule.accessibleName !== undefined && (!validText(rule.accessibleName) || rule.name !== rule.accessibleName)) || (rule.accessibleName === undefined && rule.classification !== 'permittedBusinessData') || !['structuralOnly', 'permittedBusinessData', 'nonsecretApproved'].includes(rule.classification))
            throw new Error('INVALID_CONTRACT');
        ids.add(rule.testId);
    }
    const limit = (value, ceiling, minimum = 1) => {
        const resolved = value ?? ceiling;
        if (!Number.isInteger(resolved) || resolved < minimum || resolved > ceiling)
            throw new Error('INVALID_CONTRACT');
        return resolved;
    };
    return structuredClone({ ...config, workLimits: {
            elements: limit(config.workLimits?.elements, 4096), depth: limit(config.workLimits?.depth, 64),
        }, limits: {
            nodes: limit(config.limits?.nodes, 500), depth: limit(config.limits?.depth, 8),
            bytes: limit(config.limits?.bytes, 32768), milliseconds: limit(config.limits?.milliseconds, 50),
        } });
}
export function exportObservation(observation, maxBytes) {
    const json = canonicalObservation(observation);
    const bytes = Buffer.byteLength(json, 'utf8');
    if (bytes > maxBytes)
        throw new Error('BUDGET_EXCEEDED');
    // Detach the public snapshot from local identity state. Consumers cannot mutate the hash input.
    const copy = JSON.parse(json);
    const freeze = (value) => { Object.freeze(value); for (const child of Object.values(value))
        if (child && typeof child === 'object')
            freeze(child); };
    freeze(copy);
    return Object.freeze({ observation: copy, json, bytes, observationHash: createHash('sha256').update(json).digest('hex') });
}
//# sourceMappingURL=observationSanitizer.js.map