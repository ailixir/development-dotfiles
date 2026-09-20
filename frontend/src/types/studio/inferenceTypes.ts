import type { CompileDiagnostics, TestDto, TestRequest } from './studioTypes';

export interface AuthoringStep { id: string | null; text: string }
export interface ScopeDeclaration { policyVersion: '1.0.0'; declaration: 'UNKNOWN' | 'STEP_SCOPED' }
export interface InferencePlan {
  requestedMode: 'AUTO' | 'FULL'; selectedMode: 'FULL' | 'INCREMENTAL' | 'REUSE'; reason: string;
  compilationFingerprint: string; baselineRevisionId: string | null;
  baselineExecutionId: string | null; baselineExecutionStartedAt: string | null;
  writableStepIds: string[]; reusedStepIds: string[]; impactPolicyVersion: '1.0.0';
}
export interface InferenceUsage {
  proposalCount: number | null; repairCount: number | null; transportAttemptCount: number | null;
  inputTokens: number | null; outputTokens: number | null; thinkingTokens: number | null;
  usageAvailable: boolean; finishReason: string | null; cancellationOutcome: string | null; elapsedMs: number | null;
}
export interface InferenceAttempt {
  compileRequestId: string; sourceRevision: number; configurationRevision: number;
  authoringHash: string | null; state: 'RUNNING' | 'CANDIDATE' | 'NEEDS_REVISION' | 'FAILED' | 'DISCARDED';
  stage: 'CAPTURE' | 'PLANNING' | 'INFERENCE' | 'VALIDATION' | 'PUBLICATION' | 'COMPLETE'; usage: InferenceUsage; plan: InferencePlan; revisionId: string | null; artifactHash: string | null;
  errorCode: string | null; diagnostics: CompileDiagnostics | null;
}
export interface InferenceView {
  test: TestDto; authoring: { version: 2; steps: AuthoringStep[]; scope: ScopeDeclaration } | null;
  authoringHash: string | null; scopeReviewedBy: string | null; scopeReviewedAt: string | null;
  compileAttempt: InferenceAttempt | null;
}
export type InferenceWrite = Omit<TestRequest, 'steps'> & { steps: AuthoringStep[]; scope: ScopeDeclaration };
export interface InferenceCompile {
  mode: 'AUTO' | 'FULL'; sourceRevision: number; configurationRevision: number; authoringHash: string;
}
export interface InferenceConfirm {
  compileRequestId: string; revisionId: string; artifactHash: string; sourceRevision: number;
  configurationRevision: number; authoringHash: string;
}

export interface InferenceAccepted {
  compileRequestId: string; compileStatus: 'COMPILING'; sourceRevision: number;
  configurationRevision: number; authoringHash: string; plan: InferencePlan;
}
