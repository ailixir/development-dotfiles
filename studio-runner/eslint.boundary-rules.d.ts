import type { Linter } from 'eslint';

export declare const boundaryGlobals: Record<string, 'readonly'>;
export interface ModuleGroup {
  readonly id: string;
  readonly modules: readonly string[];
  readonly message: string;
}
export declare const MODULE_GROUPS: readonly ModuleGroup[];
export declare const FORBIDDEN_MODULES: string[];
export declare const MESSAGE_FOR_MODULE: Record<string, string>;
export declare const RUN_ONLY_MODULES: string[];
export declare const PLAYWRIGHT_MODULES: string[];
export declare const SANDBOX_FLAG_SYNTAX: readonly { selector: string; message: string }[];
export declare const executionBoundaryRules: Linter.RulesRecord;
export declare const runDirectoryRules: Linter.RulesRecord;
export declare const browserModuleRules: Linter.RulesRecord;
