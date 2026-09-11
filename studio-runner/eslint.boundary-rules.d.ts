import type { Linter } from 'eslint';

export declare const boundaryGlobals: Record<string, 'readonly'>;
export declare const FORBIDDEN_MODULES: string[];
export declare const RUN_ONLY_MODULES: string[];
export declare const executionBoundaryRules: Linter.RulesRecord;
export declare const runDirectoryRules: Linter.RulesRecord;
