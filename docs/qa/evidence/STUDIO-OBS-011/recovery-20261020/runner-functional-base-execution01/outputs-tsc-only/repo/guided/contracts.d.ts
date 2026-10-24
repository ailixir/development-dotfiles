import type { BridgeIdentity } from './types.js';
interface Schema {
    $id?: string;
    $ref?: string;
    const?: unknown;
    enum?: unknown[];
    type?: string | string[];
    properties?: Record<string, Schema>;
    required?: string[];
    additionalProperties?: boolean | Schema;
    propertyNames?: Schema;
    minProperties?: number;
    maxProperties?: number;
    items?: Schema;
    minItems?: number;
    maxItems?: number;
    uniqueItems?: boolean;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    pattern?: string;
    format?: string;
    oneOf?: Schema[];
    allOf?: Schema[];
    not?: Schema;
    if?: Schema;
    then?: Schema;
    else?: Schema;
    definitions?: Record<string, Schema>;
    contains?: Schema;
    dependencies?: Record<string, Schema | string[] | boolean>;
}
export declare function insist(condition: unknown, code?: string): asserts condition;
export declare function canonical(value: unknown): string;
export declare function hash(value: unknown): string;
/** Audit the actually bundled wire subset at load time. Unknown semantics never degrade to {}. */
export declare function auditSchemaBundle(bundle: unknown): WeakMap<Schema, Schema>;
/** Exact frozen schemas, including unknown-field rejection. Never echo validator input or errors. */
export declare function validate<T>(name: string, value: unknown, definition?: string): T;
export declare const identityKeys: readonly ["schemaVersion", "sessionId", "workerId", "ownerFence", "scopeHash", "contextId", "contextRevision", "sourceRevision", "configurationRevision", "versions"];
export declare function identity(value: BridgeIdentity): BridgeIdentity;
export declare function sameIdentity(a: BridgeIdentity, b: BridgeIdentity): boolean;
export {};
