/** Bounded wire JSON parser: native JSON.parse alone loses duplicate keys and replaces bad UTF-8. */
export declare function parseWireJson(bytes: Uint8Array): unknown;
