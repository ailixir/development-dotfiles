/** Generated from closed observed v3 contracts by tools/build-studio-observed-schemas.cjs. Never edit by hand. */
export interface GuidedAction {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "coordinate": {
        readonly "stepId": string;
        readonly "ordinal": number;
    };
    readonly "scopeHash": string;
    readonly "generation": number;
    readonly "target": ({
        readonly "nodeId": string;
        readonly "documentId": string;
        readonly "generation": number;
        readonly "locator": ({
            readonly "kind": "role";
            readonly "role": string;
            readonly "name": string;
            readonly "exact": true;
        }) | ({
            readonly "kind": "label" | "testId" | "text" | "placeholder";
            readonly "value": string;
            readonly "exact": true;
        });
    }) | ({
        readonly "kind": "page";
        readonly "documentId": string;
        readonly "generation": number;
    }) | ({
        readonly "kind": "passwordControl";
        readonly "documentId": string;
        readonly "generation": number;
    });
    readonly "operation": ({
        readonly "kind": "click" | "check" | "uncheck" | "hover";
    }) | ({
        readonly "kind": "fill";
        readonly "value": ({
            readonly "kind": "authoredLiteral";
            readonly "sourceInputId": string;
        }) | ({
            readonly "kind": "binding";
            readonly "bindingId": string;
        }) | ({
            readonly "kind": "secretRef";
            readonly "sourceInputId": string;
        });
    }) | ({
        readonly "kind": "press";
        readonly "key": "Enter" | "Tab" | "Escape" | "ArrowDown" | "ArrowUp";
    }) | ({
        readonly "kind": "selectOption";
        readonly "value": ({
            readonly "kind": "authoredLiteral";
            readonly "sourceInputId": string;
        }) | ({
            readonly "kind": "binding";
            readonly "bindingId": string;
        });
    }) | ({
        readonly "kind": "navigate";
        readonly "destinationInputId": string;
    }) | ({
        readonly "kind": "read";
        readonly "bindingId": string;
        readonly "recipe": ({
            readonly "kind": "visibleText";
            readonly "classification": "permittedBusinessData";
            readonly "policyRuleId": string;
        }) | ({
            readonly "kind": "controlValue";
            readonly "classification": "nonsecretApproved";
            readonly "controlType": "text" | "search" | "email" | "tel" | "url" | "textarea";
            readonly "policyRuleId": string;
        });
    }) | ({
        readonly "kind": "assert";
        readonly "predicate": "visible" | "containsText" | "hasValue" | "url" | "title";
        readonly "expected": (({
            readonly "kind": "authoredLiteral";
            readonly "sourceInputId": string;
        }) | ({
            readonly "kind": "binding";
            readonly "bindingId": string;
        })) | (null);
    });
    readonly "executionEvidence": ExecutionEvidence;
    readonly "evidenceHash": string;
    readonly "authoredInputsHash": string;
    readonly "contextRevision": number;
}
export type ExecutionEvidence = ({
    readonly "kind": "initialBlank";
    readonly "sessionId": string;
    readonly "contextId": string;
    readonly "creationId": string;
    readonly "documentId": string;
    readonly "bootstrapId": string;
    readonly "url": "about:blank";
    readonly "origin": null;
    readonly "generation": 0;
}) | ({
    readonly "kind": "observedDocument";
    readonly "sessionId": string;
    readonly "contextId": string;
    readonly "documentId": string;
    readonly "generation": number;
    readonly "origin": string;
    readonly "observationHash": string;
});
export interface ActionTiming {
    readonly "kind": "step" | "action" | "clarificationWait" | "prefixReplay";
    readonly "stepId": string;
    readonly "admissionId": (null) | (string);
    readonly "ordinal": (null) | (number);
    readonly "startMs": number;
    readonly "endMs": (null) | (number);
}
export interface OriginalAllocation {
    readonly "bindingId": string;
    readonly "needId": string;
    readonly "producerStepId": string;
    readonly "consumers": readonly ({
        readonly "stepId": string;
        readonly "argumentSlot": "fill.value" | "selectOption.value" | "assert.expected";
    })[];
}
export interface Assignment {
    readonly "schemaVersion": 3;
    readonly "assignmentId": string;
    readonly "sessionId": string;
    readonly "workerId": string;
    readonly "scopeHash": string;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "versions": Versions;
    readonly "expectedFence": number;
    readonly "expiresAt": string;
}
export interface Versions {
    readonly "contract": 3;
}
export interface AssignmentLifecycle {
    readonly "schemaVersion": 3;
    readonly "kind": "assignment";
    readonly "assignment": Assignment;
    readonly "reason": "CANCELLED" | "EXPIRED" | "UNKNOWN_OUTCOME" | "LEASE_LOST" | "CONTEXT_LOST" | "REVOKED";
}
export interface AssignmentStop {
    readonly "schemaVersion": 3;
    readonly "kind": "assignment";
    readonly "assignment": Assignment;
    readonly "reason": "CANCELLED" | "EXPIRED" | "UNKNOWN_OUTCOME" | "LEASE_LOST" | "CONTEXT_LOST" | "REVOKED";
}
export interface AuthoredInputs {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "scopeHash": string;
    readonly "sourceRevision": string;
    readonly "inputs": readonly (({
        readonly "inputId": string;
        readonly "sourceStepId": string;
        readonly "kind": "nonsecretText";
        readonly "value": string;
        readonly "intendedSlot": "navigate.destination" | "fill.value" | "selectOption.value" | "assert.expected";
        readonly "provenance": SourceReference;
    }) | ({
        readonly "inputId": string;
        readonly "sourceStepId": string;
        readonly "kind": "destination";
        readonly "value": string;
        readonly "intendedSlot": "navigate.destination" | "fill.value" | "selectOption.value" | "assert.expected";
        readonly "provenance": SourceReference;
    }) | ({
        readonly "inputId": string;
        readonly "sourceStepId": string;
        readonly "kind": "secretRef";
        readonly "intendedSlot": "fill.value";
        readonly "provenance": SourceReference;
        readonly "secretId": string;
    }))[];
    readonly "configurationRevision": string;
}
export type SourceReference = ({
    readonly "referenceKind": "sourceSpan";
    readonly "sourceRevision": string;
    readonly "stepId": string;
    readonly "startUtf16": number;
    readonly "endUtf16": number;
    readonly "kind": "nonsecretText" | "destination";
    readonly "intendedSlot": "navigate.destination" | "fill.value" | "selectOption.value" | "assert.expected";
}) | ({
    readonly "referenceKind": "configuration";
    readonly "configurationRevision": string;
    readonly "stepId": string;
    readonly "referenceId": string;
    readonly "kind": "nonsecretText" | "destination";
    readonly "intendedSlot": "navigate.destination" | "fill.value" | "selectOption.value" | "assert.expected";
}) | ({
    readonly "referenceKind": "configuration";
    readonly "configurationRevision": string;
    readonly "stepId": string;
    readonly "referenceId": string;
    readonly "kind": "secretRef";
    readonly "intendedSlot": "fill.value";
    readonly "referenceName": string;
});
export type AuthoringSnapshot = SnapshotEvidence;
export interface SnapshotEvidence {
    readonly "schemaVersion": 3;
    readonly "current": AuthoringSnapshotIdentity;
    readonly "pinnedBase": (PinnedBase) | (null);
    readonly "baseProof": (BaseSnapshotProof) | (null);
}
export interface AuthoringSnapshotIdentity {
    readonly "authoringIdentityVersion": 1;
    readonly "authoring": NormalizedAuthoring;
    readonly "authoredDeclarations": readonly (Declaration)[];
}
export interface NormalizedAuthoring {
    readonly "authoringSchemaVersion": 2;
    readonly "globalContext": GlobalContext;
    readonly "steps": readonly ({
        readonly "id": string;
        readonly "text": string;
        readonly "context": StepContext;
    })[];
}
export interface GlobalContext {
    readonly "entries": readonly ((ContextText) | (TargetHint) | (ContextualDefault))[];
    readonly "evidenceReferences": readonly (AuthoringEvidenceReference)[];
}
export interface ContextText {
    readonly "kind": "text";
    readonly "value": string;
}
export interface TargetHint {
    readonly "kind": "targetHint";
    readonly "strategy": "role" | "label" | "testId" | "text";
    readonly "value": string;
    readonly "scope": (string) | (null);
    readonly "exact": (boolean) | (null);
}
export interface ContextualDefault {
    readonly "kind": "default";
    readonly "name": string;
    readonly "value": (DefaultLiteralValue) | (DefaultVariableValue);
}
export interface DefaultLiteralValue {
    readonly "kind": "literal";
    readonly "value": string;
}
export interface DefaultVariableValue {
    readonly "kind": "variableRef";
    readonly "referenceId": string;
}
export interface AuthoringEvidenceReference {
    readonly "id": string;
    readonly "revision": number;
    readonly "source": "supplied";
    readonly "csiId": string;
    readonly "environment": string;
    readonly "route": string;
    readonly "state": string;
    readonly "stepId": string;
    readonly "capturedAt": string;
    readonly "completeness": "complete" | "partial" | "unknown";
    readonly "hash": string;
}
export interface StepContext {
    readonly "entries": readonly ((ContextText) | (LiteralInput) | (VariableReference) | (SecretReference) | (TargetHint) | (ContextualDefault))[];
    readonly "evidenceReferences": readonly (AuthoringEvidenceReference)[];
}
export interface LiteralInput {
    readonly "kind": "literal";
    readonly "value": string;
}
export interface VariableReference {
    readonly "kind": "variableRef";
    readonly "referenceId": string;
}
export interface SecretReference {
    readonly "kind": "secretRef";
    readonly "referenceId": string;
}
export type Declaration = (PlainDeclaration) | (SecretDeclaration);
export interface PlainDeclaration {
    readonly "referenceId": string;
    readonly "kind": "plain";
    readonly "valueHash": string;
}
export interface SecretDeclaration {
    readonly "referenceId": string;
    readonly "kind": "secretRef";
    readonly "secretId": string;
}
export interface PinnedBase {
    readonly "revisionId": string;
    readonly "revisionDigest": string;
}
export interface BaseSnapshotProof {
    readonly "revision": Revision;
    readonly "authoringIdentity": AuthoringSnapshotIdentity;
    readonly "configuration": Configuration;
    readonly "artifact": Artifact3;
}
export interface Revision {
    readonly "schemaVersion": 3;
    readonly "id": string;
    readonly "revisionDigest": string;
    readonly "identity": RevisionIdentity;
    readonly "stepSnapshotHashes": SnapshotMap;
    readonly "reusedFrom": ReuseMap;
}
export interface RevisionIdentity {
    readonly "version": 1;
    readonly "testId": string;
    readonly "csiId": string;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "sourceHash": string;
    readonly "configurationHash": string;
    readonly "authoringHash": string;
    readonly "learnedPlanHash": string;
    readonly "artifactHash": string;
    readonly "referencePolicyHash": string;
    readonly "operationEquivalenceHash": string;
    readonly "admissionProvenanceHash": string;
    readonly "publicationEvidenceHash": string;
    readonly "runAuthorizationHash": string;
    readonly "profileHash": string;
}
export type SnapshotMap = Readonly<Record<string, string>>;
export type ReuseMap = Readonly<Record<string, ReusedFrom>>;
export interface ReusedFrom {
    readonly "revisionId": string;
    readonly "stepId": string;
}
export interface Configuration {
    readonly "browser": "chromium";
    readonly "viewport": {
        readonly "width": number;
        readonly "height": number;
    };
    readonly "timeoutSeconds": number;
    readonly "waitStrategy": "load" | "domcontentloaded" | "networkidle";
    readonly "environment": string;
}
export interface Artifact3 {
    readonly "version": 3;
    readonly "kind": "observed";
    readonly "profile": Profile;
    readonly "sourceHash": string;
    readonly "configurationHash": string;
    readonly "authoringHash": string;
    readonly "learnedPlan": LearnedPlan;
    readonly "learnedPlanHash": string;
    readonly "inputRecipes": readonly (InputRecipe)[];
    readonly "guards": readonly (Guard)[];
    readonly "replayPolicy": Policy4;
    readonly "steps": readonly (Step)[];
}
export interface Profile {
    readonly "contract": 3;
}
export interface LearnedPlan {
    readonly "schemaVersion": 3;
    readonly "planId": string;
    readonly "scopeHash": string;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "authoredInputsHash": string;
    readonly "initialContext": ({
        readonly "kind": "initialBlank";
    }) | ({
        readonly "kind": "observedDocument";
        readonly "origin": string;
    });
    readonly "sourceSteps": readonly (string)[];
    readonly "versions": Versions;
    readonly "actions": readonly ((BlankAction) | (ObservedAction))[];
    readonly "bindings": readonly (HistoricalBinding)[];
    readonly "stepSnapshotHashes": SnapshotMap;
    readonly "reusedFrom": ReuseMap;
    readonly "incremental": (IncrementalMetadata) | (null);
}
export interface BlankAction {
    readonly "coordinate": {
        readonly "stepId": string;
        readonly "ordinal": 0;
    };
    readonly "origin": null;
    readonly "locator": null;
    readonly "operation": {
        readonly "kind": "navigate";
        readonly "destinationInputId": string;
    };
    readonly "admissionId": string;
    readonly "operationHash": string;
}
export interface ObservedAction {
    readonly "coordinate": {
        readonly "stepId": string;
        readonly "ordinal": number;
    };
    readonly "origin": string;
    readonly "locator": (({
        readonly "kind": "role";
        readonly "role": string;
        readonly "name": string;
        readonly "exact": true;
    }) | ({
        readonly "kind": "label" | "testId" | "text" | "placeholder";
        readonly "value": string;
        readonly "exact": true;
    })) | (null);
    readonly "operation": ({
        readonly "kind": "click" | "check" | "uncheck" | "hover";
    }) | ({
        readonly "kind": "fill";
        readonly "value": ({
            readonly "kind": "authoredLiteral";
            readonly "sourceInputId": string;
        }) | ({
            readonly "kind": "binding";
            readonly "bindingId": string;
        }) | ({
            readonly "kind": "secretRef";
            readonly "sourceInputId": string;
        });
    }) | ({
        readonly "kind": "press";
        readonly "key": "Enter" | "Tab" | "Escape" | "ArrowDown" | "ArrowUp";
    }) | ({
        readonly "kind": "selectOption";
        readonly "value": ({
            readonly "kind": "authoredLiteral";
            readonly "sourceInputId": string;
        }) | ({
            readonly "kind": "binding";
            readonly "bindingId": string;
        });
    }) | ({
        readonly "kind": "navigate";
        readonly "destinationInputId": string;
    }) | ({
        readonly "kind": "read";
        readonly "bindingId": string;
        readonly "recipe": ({
            readonly "kind": "visibleText";
            readonly "classification": "permittedBusinessData";
            readonly "policyRuleId": string;
        }) | ({
            readonly "kind": "controlValue";
            readonly "classification": "nonsecretApproved";
            readonly "controlType": "text" | "search" | "email" | "tel" | "url" | "textarea";
            readonly "policyRuleId": string;
        });
    }) | ({
        readonly "kind": "assert";
        readonly "predicate": "visible" | "containsText" | "hasValue" | "url" | "title";
        readonly "expected": (({
            readonly "kind": "authoredLiteral";
            readonly "sourceInputId": string;
        }) | ({
            readonly "kind": "binding";
            readonly "bindingId": string;
        })) | (null);
    });
    readonly "admissionId": string;
    readonly "operationHash": string;
}
export interface HistoricalBinding {
    readonly "schemaVersion": 3;
    readonly "bindingId": string;
    readonly "valueType": "string";
    readonly "producer": {
        readonly "stepId": string;
        readonly "ordinal": number;
    };
    readonly "recipe": ({
        readonly "kind": "visibleText";
        readonly "classification": "permittedBusinessData";
        readonly "policyRuleId": string;
    }) | ({
        readonly "kind": "controlValue";
        readonly "classification": "nonsecretApproved";
        readonly "controlType": "text" | "search" | "email" | "tel" | "url" | "textarea";
        readonly "policyRuleId": string;
    });
    readonly "sourceOrigin": string;
    readonly "consumers": readonly (OriginalConsumerEdge)[];
    readonly "provenance": {
        readonly "sessionId": string;
        readonly "producerAdmissionId": string;
        readonly "sourceIntentStepId": string;
    };
    readonly "transferPolicy": "sameOrigin";
    readonly "preserveBytes": true;
}
export interface OriginalConsumerEdge {
    readonly "bindingId": string;
    readonly "producerAdmissionId": string;
    readonly "consumerAdmissionId": string;
    readonly "coordinate": {
        readonly "stepId": string;
        readonly "ordinal": number;
    };
    readonly "argumentSlot": "fill.value" | "selectOption.value" | "assert.expected";
    readonly "destinationOrigin": string;
    readonly "transferPolicy": "sameOrigin";
}
export interface IncrementalMetadata {
    readonly "baseRevisionId": string;
    readonly "initialFirstLearnStepId": string;
    readonly "effectiveFirstLearnStepId": string;
    readonly "retainedPrefixAdmissionIds": readonly (string)[];
    readonly "driftReceiptHash": (string) | (null);
}
export interface InputRecipe {
    readonly "inputId": string;
    readonly "stepId": string;
    readonly "kind": "destination" | "nonsecretText" | "secretRef";
    readonly "intendedSlot": "navigate.destination" | "fill.value" | "selectOption.value" | "assert.expected";
    readonly "provenance": ({
        readonly "kind": "sourceSpan";
        readonly "start": number;
        readonly "end": number;
        readonly "sourceHash": string;
    }) | ({
        readonly "kind": "configuration";
        readonly "referenceId": string;
        readonly "referenceName": string;
    });
}
export interface Guard {
    readonly "guardId": string;
    readonly "origin": (string) | (null);
    readonly "target": ({
        readonly "kind": "initialBlank";
    }) | ({
        readonly "kind": "page";
    }) | ({
        readonly "kind": "element";
        readonly "locator": ({
            readonly "kind": "role";
            readonly "role": string;
            readonly "name": string;
            readonly "exact": true;
        }) | ({
            readonly "kind": "label" | "testId" | "text" | "placeholder";
            readonly "value": string;
            readonly "exact": true;
        });
        readonly "role": string;
        readonly "elementType": "button" | "input" | "textarea" | "select" | "text" | "link" | "other";
        readonly "controlType": "none" | "text" | "search" | "email" | "tel" | "url" | "textarea" | "password" | "hidden" | "other";
        readonly "classification": "structuralOnly" | "permittedBusinessData" | "nonsecretApproved" | "withheld";
        readonly "visible": boolean;
        readonly "actionable": boolean;
        readonly "readRuleId": (string) | (null);
    }) | ({
        readonly "kind": "passwordControl";
    });
}
export interface Policy4 {
    readonly "schemaVersion": 4;
    readonly "learnedPlanHash": string;
    readonly "admissionProvenanceHash": string;
    readonly "publicationEvidenceHash": string;
    readonly "runAuthorizationHash": string;
    readonly "scope": ReplayRequirements;
    readonly "inputs": readonly (InputRecipe)[];
    readonly "bindings": readonly (HistoricalBinding)[];
    readonly "transfers": readonly (Transfer)[];
}
export interface ReplayRequirements {
    readonly "csiId": string;
    readonly "environment": string;
    readonly "applicationId": string;
    readonly "allowedOrigins": readonly (string)[];
    readonly "capabilities": readonly ("navigate" | "click" | "fill" | "press" | "check" | "uncheck" | "hover" | "selectOption" | "read" | "assert")[];
    readonly "policyId": string;
    readonly "policyVersion": string;
    readonly "entryPolicyId": string;
    readonly "initialContext": ({
        readonly "kind": "initialBlank";
    }) | ({
        readonly "kind": "observedDocument";
        readonly "origin": string;
    });
}
export interface Transfer {
    readonly "bindingId": string;
    readonly "producer": {
        readonly "stepId": string;
        readonly "ordinal": number;
    };
    readonly "consumer": {
        readonly "stepId": string;
        readonly "ordinal": number;
    };
    readonly "slot": "fill.value" | "selectOption.value" | "assert.expected";
    readonly "origin": string;
}
export interface Step {
    readonly "stepIndex": number;
    readonly "stepId": string;
    readonly "operations": readonly (ReplayAction)[];
}
export interface ReplayAction {
    readonly "coordinate": {
        readonly "stepId": string;
        readonly "ordinal": number;
    };
    readonly "guardId": string;
    readonly "operation": ({
        readonly "kind": "click" | "check" | "uncheck" | "hover";
    }) | ({
        readonly "kind": "fill";
        readonly "value": ({
            readonly "kind": "authoredLiteral";
            readonly "sourceInputId": string;
        }) | ({
            readonly "kind": "binding";
            readonly "bindingId": string;
        }) | ({
            readonly "kind": "secretRef";
            readonly "sourceInputId": string;
        });
    }) | ({
        readonly "kind": "press";
        readonly "key": "Enter" | "Tab" | "Escape" | "ArrowDown" | "ArrowUp";
    }) | ({
        readonly "kind": "selectOption";
        readonly "value": ({
            readonly "kind": "authoredLiteral";
            readonly "sourceInputId": string;
        }) | ({
            readonly "kind": "binding";
            readonly "bindingId": string;
        });
    }) | ({
        readonly "kind": "navigate";
        readonly "destinationInputId": string;
    }) | ({
        readonly "kind": "read";
        readonly "bindingId": string;
        readonly "recipe": ({
            readonly "kind": "visibleText";
            readonly "classification": "permittedBusinessData";
            readonly "policyRuleId": string;
        }) | ({
            readonly "kind": "controlValue";
            readonly "classification": "nonsecretApproved";
            readonly "controlType": "text" | "search" | "email" | "tel" | "url" | "textarea";
            readonly "policyRuleId": string;
        });
    }) | ({
        readonly "kind": "assert";
        readonly "predicate": "visible" | "containsText" | "hasValue" | "url" | "title";
        readonly "expected": (({
            readonly "kind": "authoredLiteral";
            readonly "sourceInputId": string;
        }) | ({
            readonly "kind": "binding";
            readonly "bindingId": string;
        })) | (null);
    });
}
export type Bridge = unknown;
export interface GuidedIdentity {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "workerId": string;
    readonly "ownerFence": number;
    readonly "scopeHash": string;
    readonly "contextId": string;
    readonly "contextRevision": number;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "versions": Versions;
}
export type Prepare = (OrdinaryPrepare) | (PrefixPrepare);
export interface OrdinaryPrepare {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "workerId": string;
    readonly "ownerFence": number;
    readonly "scopeHash": string;
    readonly "contextId": string;
    readonly "contextRevision": number;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "versions": Versions;
    readonly "proposal": GuidedAction;
    readonly "requestDigest": string;
    readonly "expiresAt": string;
}
export interface PrefixPrepare {
    readonly "kind": "prefix";
    readonly "request": PrefixRequestIdentity;
    readonly "requestDigest": string;
}
export interface PrefixRequestIdentity {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "workerId": string;
    readonly "ownerFence": number;
    readonly "scopeHash": string;
    readonly "contextId": string;
    readonly "contextRevision": number;
    readonly "authoredInputsHash": string;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "prefixProgramHash": string;
    readonly "coordinate": {
        readonly "stepId": string;
        readonly "ordinal": number;
    };
    readonly "evidenceHash": string;
}
export interface Preparation {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "workerId": string;
    readonly "ownerFence": number;
    readonly "scopeHash": string;
    readonly "contextId": string;
    readonly "contextRevision": number;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "versions": Versions;
    readonly "preparationId": string;
    readonly "requestDigest": string;
    readonly "evidenceHash": string;
    readonly "authoredInputsHash": string;
    readonly "expiresAt": string;
}
export interface Dispatch {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "workerId": string;
    readonly "ownerFence": number;
    readonly "scopeHash": string;
    readonly "contextId": string;
    readonly "contextRevision": number;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "versions": Versions;
    readonly "proposal": GuidedAction;
    readonly "ledger": GuidedLedger;
    readonly "preparationId": string;
    readonly "consumerEdges": readonly (OriginalConsumerEdge)[];
    readonly "secret"?: {
        readonly "secretId": string;
        readonly "value": string;
        readonly "versionId": string;
        readonly "allowedOrigins": readonly (string)[];
    };
}
export interface GuidedLedger {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "coordinate": {
        readonly "stepId": string;
        readonly "ordinal": number;
    };
    readonly "idempotencyKey": string;
    readonly "requestDigest": string;
    readonly "scopeHash": string;
    readonly "operationHash": string;
    readonly "generation": number;
    readonly "documentId": string;
    readonly "ownerFence": number;
    readonly "admission": {
        readonly "admissionId": string;
        readonly "authorizationId": string;
        readonly "admittedAt": string;
        readonly "policyDecisionHash": string;
    };
    readonly "state": "ADMITTED" | "DISPATCHING" | "SUCCEEDED" | "FAILED" | "UNKNOWN_OUTCOME" | "REVOKED";
    readonly "dispatchCount": number;
    readonly "outcomeCode": "PENDING" | "OK" | "ASSERTION_FAILED" | "TARGET_CHANGED" | "POLICY_DENIED" | "TIMEOUT" | "ACK_LOST" | "CANCELLED";
    readonly "assertionPassed": boolean | null;
    readonly "executionEvidence": ExecutionEvidence;
    readonly "evidenceHash": string;
    readonly "authoredInputsHash": string;
    readonly "contextRevision": number;
    readonly "preparationId": string;
    readonly "attemptOrdinal": number;
}
export type Stop = ({
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "workerId": string;
    readonly "ownerFence": number;
    readonly "scopeHash": string;
    readonly "contextId": string;
    readonly "contextRevision": number;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "versions": Versions;
    readonly "reason": "CANCELLED" | "EXPIRED" | "UNKNOWN_OUTCOME" | "LEASE_LOST" | "CONTEXT_LOST" | "REVOKED";
}) | (AssignmentStop);
export interface Bootstrap {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "workerId": string;
    readonly "ownerFence": number;
    readonly "scopeHash": string;
    readonly "contextId": string;
    readonly "contextRevision": number;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "versions": Versions;
    readonly "executionEvidence": {
        readonly "kind": "initialBlank";
        readonly "sessionId": string;
        readonly "contextId": string;
        readonly "creationId": string;
        readonly "documentId": string;
        readonly "bootstrapId": string;
        readonly "url": "about:blank";
        readonly "origin": null;
        readonly "generation": 0;
    };
    readonly "evidenceHash": string;
}
export type Outcome = (OrdinaryOutcome) | (PrefixDriftCallback);
export interface OrdinaryOutcome {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "workerId": string;
    readonly "ownerFence": number;
    readonly "scopeHash": string;
    readonly "contextId": string;
    readonly "contextRevision": number;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "versions": Versions;
    readonly "ledger": GuidedLedger;
    readonly "availability": ({
        readonly "bindingId": string;
        readonly "producerAdmissionId": string;
        readonly "contextId": string;
        readonly "workerId": string;
        readonly "ownerFence": number;
    }) | (null);
    readonly "errorMessage"?: string;
}
export interface PrefixDriftCallback {
    readonly "kind": "prefixDrift";
    readonly "receipt": DriftReceipt;
    readonly "ledger": (GuidedLedger) | (null);
}
export type DriftReceipt = (PreAdmissionDrift) | (AdmittedDrift);
export interface PreAdmissionDrift {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "workerId": string;
    readonly "ownerFence": number;
    readonly "scopeHash": string;
    readonly "contextId": string;
    readonly "contextRevision": number;
    readonly "authoredInputsHash": string;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "prefixProgramHash": string;
    readonly "coordinate": {
        readonly "stepId": string;
        readonly "ordinal": number;
    };
    readonly "evidenceHash": string;
    readonly "requestDigest": string;
    readonly "operationHash": string;
    readonly "attemptOrdinal": 0;
    readonly "nativeInvocationStarted": false;
    readonly "reason": "TARGET_DRIFT" | "LOCATOR_AMBIGUOUS" | "STALE_GENERATION";
    readonly "receiptHash": string;
    readonly "phase": "PRE_ADMISSION";
    readonly "admissionId": null;
    readonly "preparationId": null;
}
export interface AdmittedDrift {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "workerId": string;
    readonly "ownerFence": number;
    readonly "scopeHash": string;
    readonly "contextId": string;
    readonly "contextRevision": number;
    readonly "authoredInputsHash": string;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "prefixProgramHash": string;
    readonly "coordinate": {
        readonly "stepId": string;
        readonly "ordinal": number;
    };
    readonly "evidenceHash": string;
    readonly "requestDigest": string;
    readonly "operationHash": string;
    readonly "attemptOrdinal": 0;
    readonly "nativeInvocationStarted": false;
    readonly "reason": "TARGET_DRIFT" | "LOCATOR_AMBIGUOUS" | "STALE_GENERATION";
    readonly "receiptHash": string;
    readonly "phase": "ADMITTED_PRE_INVOCATION";
    readonly "admissionId": string;
    readonly "preparationId": string;
}
export type Lifecycle = ({
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "workerId": string;
    readonly "ownerFence": number;
    readonly "scopeHash": string;
    readonly "contextId": string;
    readonly "contextRevision": number;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "versions": Versions;
    readonly "reason": "CANCELLED" | "EXPIRED" | "UNKNOWN_OUTCOME" | "LEASE_LOST" | "CONTEXT_LOST" | "REVOKED";
}) | (AssignmentLifecycle);
export interface Observation {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "workerId": string;
    readonly "ownerFence": number;
    readonly "scopeHash": string;
    readonly "contextId": string;
    readonly "contextRevision": number;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "versions": Versions;
    readonly "observation": ObservedPage;
}
export interface ObservedPage {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "documentId": string;
    readonly "generation": number;
    readonly "origin": string;
    readonly "scopeHash": string;
    readonly "observedAt": string;
    readonly "coverage": {
        readonly "mode": "semantic" | "boundedDom";
        readonly "complete": boolean;
        readonly "truncated": boolean;
        readonly "withheldRegions": number;
        readonly "reason": "complete" | "budget" | "sensitivity" | "unsupportedSurface";
        readonly "passwordControls": number;
    };
    readonly "nodes": readonly ({
        readonly "nodeId": string;
        readonly "documentId": string;
        readonly "generation": number;
        readonly "role": string;
        readonly "name": string;
        readonly "elementType": "button" | "input" | "textarea" | "select" | "text" | "link" | "other";
        readonly "controlType": "none" | "text" | "search" | "email" | "tel" | "url" | "textarea" | "password" | "hidden" | "other";
        readonly "classification": "structuralOnly" | "permittedBusinessData" | "nonsecretApproved" | "withheld";
        readonly "policyRuleId": string;
        readonly "visible": boolean;
        readonly "actionable": boolean;
        readonly "depth": number;
        readonly "parentNodeId": string | null;
        readonly "regionId": string | null;
        readonly "formId": string | null;
        readonly "labelNodeIds": readonly (string)[];
        readonly "locatorHints": readonly (({
            readonly "kind": "role";
            readonly "role": string;
            readonly "name": string;
            readonly "exact": true;
        }) | ({
            readonly "kind": "label" | "testId" | "text" | "placeholder";
            readonly "value": string;
            readonly "exact": true;
        }))[];
    })[];
}
export interface RecordingEvidence {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "workerId": string;
    readonly "ownerFence": number;
    readonly "scopeHash": string;
    readonly "contextId": string;
    readonly "contextRevision": number;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "versions": Versions;
    readonly "recordingId": string;
    readonly "state": "STORED" | "FAILED" | "UNAVAILABLE";
    readonly "partial": boolean;
    readonly "timings": readonly (ActionTiming)[];
}
export interface Refusal {
    readonly "code": "AUTH_DENIED" | "IDEMPOTENCY_CONFLICT" | "SCHEMA" | "IDENTITY_MISMATCH" | "CAPACITY" | "CONTEXT_LOST" | "ALREADY_CONSUMED" | "BUSY" | "TARGET_CHANGED" | "PREPARATION_DENIED" | "ADMISSION_DENIED" | "BINDING_UNAVAILABLE" | "BINDING_DENIED" | "BINDING_ORDER" | "ACTION_ORDER" | "CONTEXT_REVISION" | "INPUT_IDENTITY" | "BUDGET_EXCEEDED" | "POLICY_DENIED";
    readonly "reason"?: "PASSWORD_TARGET_ABSENT" | "PASSWORD_TARGET_AMBIGUOUS" | "PASSWORD_FORM_ACTION_NOT_ALLOWED" | "PASSWORD_CONTROL_READ_REFUSED";
}
export type PrefixPrepareResult = ({
    readonly "kind": "PREPARED";
    readonly "requestDigest": string;
    readonly "proposal": GuidedAction;
    readonly "preparation": Preparation;
}) | ({
    readonly "kind": "WAIT";
    readonly "requestDigest": string;
    readonly "evidenceHash": string;
}) | ({
    readonly "kind": "DRIFT";
    readonly "requestDigest": string;
    readonly "receipt": PreAdmissionDrift;
});
export interface ContextDelivery {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "contextRevision": number;
    readonly "authoredInputsHash": string;
    readonly "materializationRevision": number;
    readonly "contextHash": string;
    readonly "deliveryId": string;
}
export interface ContextAcknowledgement {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "workerId": string;
    readonly "ownerFence": number;
    readonly "scopeHash": string;
    readonly "contextId": string;
    readonly "contextRevision": number;
    readonly "authoredInputsHash": string;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "materializationRevision": number;
    readonly "contextHash": string;
    readonly "deliveryId": string;
}
export interface Switch {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "baseRevisionId": string;
    readonly "initialFirstLearnStepId": string;
    readonly "effectiveFirstLearnStepId": string;
    readonly "effectiveFirstLearnIndex": number;
    readonly "nextSemanticOrdinal": number;
    readonly "completedPrefixCount": number;
    readonly "reason": "BOUNDARY" | "DRIFT" | "EMPTY_PREFIX";
    readonly "driftReceiptHash": (string) | (null);
    readonly "retainedPrefixAdmissionIds": readonly (string)[];
    readonly "retainedPrefixAdmissionsHash": string;
}
export interface FirstSuffixAcceptance {
    readonly "sessionId": string;
    readonly "previousPlanRevision": number;
    readonly "planRevision": number;
    readonly "retainedPrefixAdmissionIds": readonly (string)[];
}
export interface NativeFenceEvent {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "contextId": string;
    readonly "ownerFence": number;
    readonly "admissionId": string;
    readonly "operationHash": string;
    readonly "state": "INVOKING" | "REFUSED_BEFORE_INVOCATION";
    readonly "receiptHash": (string) | (null);
}
export type PrepareRequest = Prepare;
export type PrepareResponse = (Preparation) | (PrefixPrepareResult);
export type OutcomeCallback = Outcome;
export interface Clarification {
    readonly "schemaVersion": 3;
    readonly "clarificationId": string;
    readonly "sessionId": string;
    readonly "scopeHash": string;
    readonly "coordinate": {
        readonly "stepId": string;
        readonly "ordinal": number;
    };
    readonly "documentId": (string) | (null);
    readonly "generation": number;
    readonly "reason": "AMBIGUOUS_TARGET" | "AMBIGUOUS_BINDING" | "MISSING_SOURCE" | "INSUFFICIENT_EVIDENCE" | "UNSUPPORTED_SURFACE" | "SIDE_EFFECT_CONFIRMATION";
    readonly "promptCode": "CHOOSE_FIELD" | "CHOOSE_SOURCE" | "REVISE_STEP" | "CONFIRM_ACTION";
    readonly "choices": readonly ({
        readonly "choiceId": string;
        readonly "safeLabel": string;
        readonly "labelSource": "AUTHORED" | "SAVED_INPUT" | "PAGE";
        readonly "role"?: string;
        readonly "region"?: string | null;
        readonly "nodeId": string | null;
        readonly "bindingId": string | null;
    })[];
    readonly "expiresAt": string;
    readonly "phase": "source" | "observed";
}
export interface RelearnedFrom {
    readonly "stepId": string;
    readonly "driftSwitchStepId"?: string;
}
export interface Limits {
    readonly "maxSessionSeconds": number;
    readonly "maxActions": number;
    readonly "maxObservations": number;
    readonly "maxModelProposals": number;
    readonly "maxModelInputTokensTotal": number;
    readonly "maxModelOutputTokensTotal": number;
    readonly "maxObservationBytes": number;
    readonly "maxObservationNodes": number;
    readonly "maxObservationDepth": number;
    readonly "maxSanitizedEvidenceBytesTotal": number;
    readonly "maxRuntimeValues": number;
    readonly "maxRuntimeValueBytes": number;
    readonly "maxRuntimeValuesBytesTotal": number;
    readonly "maxSourceSteps": number;
    readonly "maxStatementsPerStep": number;
}
export interface OriginalProducer {
    readonly "bindingId": string;
    readonly "producerAdmissionId": string;
    readonly "coordinate": {
        readonly "stepId": string;
        readonly "ordinal": number;
    };
    readonly "origin": string;
    readonly "recipe": ({
        readonly "kind": "visibleText";
        readonly "classification": "permittedBusinessData";
        readonly "policyRuleId": string;
    }) | ({
        readonly "kind": "controlValue";
        readonly "classification": "nonsecretApproved";
        readonly "controlType": "text" | "search" | "email" | "tel" | "url" | "textarea";
        readonly "policyRuleId": string;
    });
    readonly "availability": {
        readonly "bindingId": string;
        readonly "producerAdmissionId": string;
        readonly "contextId": string;
        readonly "workerId": string;
        readonly "ownerFence": number;
    };
}
export interface FinalizeRequest {
    readonly "schemaVersion": 3;
    readonly "expectedSourceRevision": string;
    readonly "expectedConfigurationRevision": string;
}
export interface PublicationReceipt {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "revisionId": string;
    readonly "revisionDigest": string;
    readonly "learnedPlanHash": string;
    readonly "artifactHash": string;
    readonly "publicationEvidenceHash": string;
    readonly "publishedAt": string;
    readonly "learnedFromThisRun": true;
    readonly "replayVerified": false;
    readonly "relearnedFrom": (RelearnedFrom) | (null);
}
export type ObservedFrame = (Launch3) | (Execute3) | (Ready3) | (StepStarted3) | (StepFinished3) | (Result3) | (Stop);
export interface Launch3 {
    readonly "kind": "launch";
    readonly "protocolVersion": 3;
    readonly "mode": "observed";
    readonly "runId": string;
    readonly "attemptId": string;
    readonly "admission": AdmissionReceipt;
    readonly "profile": Profile;
    readonly "build": BuildIdentity;
    readonly "scopeHash": string;
    readonly "configurationHash": string;
    readonly "browser": "chromium";
    readonly "viewport": {
        readonly "width": number;
        readonly "height": number;
    };
    readonly "recording": {
        readonly "width": number;
        readonly "height": number;
    };
    readonly "seekOriginCalibrationMs": number;
    readonly "scratchPath": string;
    readonly "totalRuntimeMs": number;
    readonly "policy": TrustedPolicy;
    readonly "scope": Scope;
}
export interface AdmissionReceipt {
    readonly "schemaVersion": 3;
    readonly "kind": "observed";
    readonly "admissionId": string;
    readonly "request": AdmissionRequest;
    readonly "admittedAt": string;
    readonly "startDeadlineAt": string;
    readonly "runDeadlineAt": string;
}
export interface AdmissionRequest {
    readonly "schemaVersion": 3;
    readonly "kind": "observed";
    readonly "executionId": string;
    readonly "startedAt": string;
    readonly "attemptId": string;
    readonly "runnerInstanceId": string;
    readonly "admissionId": string;
    readonly "revisionId": string;
    readonly "revisionDigest": string;
    readonly "artifactHash": string;
    readonly "configurationHash": string;
    readonly "learnedPlanHash": string;
    readonly "referencePolicyHash": string;
    readonly "publicationEvidenceHash": string;
    readonly "scopeHash": string;
    readonly "currentPolicyHash": string;
    readonly "grantId": string;
    readonly "profile": Profile;
    readonly "build": BuildIdentity;
}
export interface BuildIdentity {
    readonly "profileHash": string;
    readonly "schemaBundleHash": string;
    readonly "referenceBundleHash": string;
    readonly "executableImageDigest": string;
    readonly "chromiumBuild": string;
}
export interface TrustedPolicy {
    readonly "version": 1;
    readonly "policyId": string;
    readonly "policyVersion": string;
    readonly "applicationId": string;
    readonly "environment": string;
    readonly "allowedOrigins": readonly (string)[];
    readonly "entryPolicyId": string;
    readonly "applicationPolicy": ({
        readonly "policyRuleId": string;
        readonly "allowStructuralDiscovery": true;
        readonly "readGrants": readonly (ReadGrant)[];
    }) | (null);
    readonly "rules": readonly (FieldOverride)[];
}
export interface ReadGrant {
    readonly "policyRuleId": string;
    readonly "origin": string;
    readonly "region": ({
        readonly "kind": "application";
    }) | ({
        readonly "kind": "role";
        readonly "role": "main" | "region" | "form";
        readonly "name": string;
        readonly "exact": true;
    });
    readonly "visibleText"?: {
        readonly "classification": "permittedBusinessData";
    };
    readonly "controlValue"?: {
        readonly "classification": "nonsecretApproved";
        readonly "types": readonly ("text" | "search" | "email" | "tel" | "url" | "textarea")[];
    };
}
export interface FieldOverride {
    readonly "testId": string;
    readonly "name": string;
    readonly "policyRuleId": string;
    readonly "classification": "structuralOnly" | "permittedBusinessData" | "nonsecretApproved";
    readonly "accessibleName"?: string;
}
export interface Scope {
    readonly "principalId": string;
    readonly "csiId": string;
    readonly "environment": string;
    readonly "applicationId": string;
    readonly "allowedOrigins": readonly (string)[];
    readonly "capabilities": readonly ("navigate" | "click" | "fill" | "press" | "check" | "uncheck" | "hover" | "selectOption" | "read" | "assert")[];
    readonly "policyId": string;
    readonly "policyVersion": string;
    readonly "entryPolicyId": string;
    readonly "initialContext": ({
        readonly "kind": "initialBlank";
    }) | ({
        readonly "kind": "observedDocument";
        readonly "origin": string;
    });
}
export interface Execute3 {
    readonly "kind": "execute";
    readonly "protocolVersion": 3;
    readonly "mode": "observed";
    readonly "runId": string;
    readonly "attemptId": string;
    readonly "profileHash": string;
    readonly "configurationHash": string;
    readonly "waitStrategy": "load" | "domcontentloaded" | "networkidle";
    readonly "stepTimeoutMs": number;
    readonly "steps": readonly (Step)[];
    readonly "guards": readonly (Guard)[];
    readonly "bindings": readonly (RuntimeBinding)[];
    readonly "transfers": readonly (Transfer)[];
    readonly "inputs": readonly (({
        readonly "inputId": string;
        readonly "stepId": string;
        readonly "kind": "destination" | "nonsecretText";
        readonly "intendedSlot": "navigate.destination" | "fill.value" | "selectOption.value" | "assert.expected";
        readonly "value": string;
    }) | ({
        readonly "inputId": string;
        readonly "stepId": string;
        readonly "kind": "secretRef";
        readonly "intendedSlot": "fill.value";
        readonly "referenceName": string;
    }))[];
    readonly "secrets": Readonly<Record<string, string>>;
    readonly "secretOrigins": Readonly<Record<string, readonly (string)[]>>;
    readonly "retainedArtifact"?: Artifact3;
}
export interface RuntimeBinding {
    readonly "bindingId": string;
    readonly "producer": {
        readonly "stepId": string;
        readonly "ordinal": number;
    };
    readonly "recipe": ({
        readonly "kind": "visibleText";
        readonly "classification": "permittedBusinessData";
        readonly "policyRuleId": string;
    }) | ({
        readonly "kind": "controlValue";
        readonly "classification": "nonsecretApproved";
        readonly "controlType": "text" | "search" | "email" | "tel" | "url" | "textarea";
        readonly "policyRuleId": string;
    });
    readonly "origin": string;
}
export interface Ready3 {
    readonly "kind": "ready";
    readonly "protocolVersion": 3;
    readonly "mode": "observed";
    readonly "runId": string;
    readonly "attemptId": string;
    readonly "profileHash": string;
    readonly "build": BuildIdentity;
    readonly "admissionId": string;
    readonly "browserStartedAt": string;
    readonly "startedAtMs": number;
    readonly "calibrationOffsetMs": (number) | (null);
}
export interface StepStarted3 {
    readonly "kind": "step-started";
    readonly "protocolVersion": 3;
    readonly "mode": "observed";
    readonly "runId": string;
    readonly "attemptId": string;
    readonly "stepIndex": number;
    readonly "stepId": string;
    readonly "startedAtMs": number;
}
export interface StepFinished3 {
    readonly "kind": "step-finished";
    readonly "protocolVersion": 3;
    readonly "mode": "observed";
    readonly "runId": string;
    readonly "attemptId": string;
    readonly "stepIndex": number;
    readonly "stepId": string;
    readonly "status": "PASS" | "FAIL" | "SKIPPED";
    readonly "startedAtMs": (number) | (null);
    readonly "finishedAtMs": (number) | (null);
    readonly "durationMs": (number) | (null);
    readonly "errorCode": ("INVALID_CONTRACT" | "PROFILE_MISMATCH" | "AUTHORIZATION_EXPIRED" | "POLICY_REFUSED" | "TARGET_DRIFT" | "READ_REFUSED" | "REFERENCE_REFUSED" | "ASSERTION_FAILED" | "CANCELLED" | "TIMEOUT" | "OUTCOME_UNKNOWN" | "INTERNAL_ERROR" | "LOGIN_REQUIRED" | "PASSWORD_CONTROL_READ_REFUSED" | "REFERENCE_MISMATCH") | (null);
    readonly "detail"?: {
        readonly "stepId": string;
        readonly "loginStepsPresent": boolean;
    };
}
export interface Result3 {
    readonly "kind": "result";
    readonly "protocolVersion": 3;
    readonly "mode": "observed";
    readonly "runId": string;
    readonly "attemptId": string;
    readonly "admissionId": string;
    readonly "profileHash": string;
    readonly "build": BuildIdentity;
    readonly "ok": boolean;
    readonly "errorCode": ("INVALID_CONTRACT" | "PROFILE_MISMATCH" | "AUTHORIZATION_EXPIRED" | "POLICY_REFUSED" | "TARGET_DRIFT" | "READ_REFUSED" | "REFERENCE_REFUSED" | "ASSERTION_FAILED" | "CANCELLED" | "TIMEOUT" | "OUTCOME_UNKNOWN" | "INTERNAL_ERROR" | "LOGIN_REQUIRED" | "PASSWORD_CONTROL_READ_REFUSED" | "REFERENCE_MISMATCH") | (null);
    readonly "recording": {
        readonly "path": (string) | (null);
        readonly "bytes": (number) | (null);
        readonly "errorCode": ("RECORDING_FAILED") | (null);
        readonly "state": "PENDING" | "FAILED" | "UNAVAILABLE";
        readonly "partial": boolean;
    };
    readonly "detail"?: {
        readonly "stepId": string;
        readonly "loginStepsPresent": boolean;
    };
    readonly "secretUse": Readonly<Record<string, "USED" | "NOT_USED" | "REFUSED">>;
}
export interface ObservedJob {
    readonly "schemaVersion": 3;
    readonly "kind": "observed";
    readonly "binding": ExecutionBinding;
    readonly "artifact": Artifact3;
    readonly "configuration": Configuration;
    readonly "inputs": readonly ({
        readonly "inputId": string;
        readonly "value": string;
    })[];
    readonly "runtime": {
        readonly "stepTimeoutMs": number;
        readonly "totalRuntimeMs": number;
    };
    readonly "recording": {
        readonly "width": number;
        readonly "height": number;
    };
    readonly "secrets": Readonly<Record<string, string>>;
    readonly "secretOrigins": Readonly<Record<string, readonly (string)[]>>;
}
export interface ExecutionBinding {
    readonly "version": 1;
    readonly "executionId": string;
    readonly "startedAt": string;
    readonly "attemptId": string;
    readonly "revisionId": string;
    readonly "revisionDigest": string;
    readonly "testId": string;
    readonly "csiId": string;
    readonly "principalId": string;
    readonly "environment": string;
    readonly "artifactHash": string;
    readonly "configurationHash": string;
    readonly "learnedPlanHash": string;
    readonly "referencePolicyHash": string;
    readonly "publicationEvidenceHash": string;
    readonly "requiredProfile": Profile;
    readonly "requiredBuild": BuildIdentity;
    readonly "scope": Scope;
    readonly "scopeHash": string;
    readonly "currentPolicyHash": string;
    readonly "replayGrant": ReplayGrant;
}
export interface ReplayGrant {
    readonly "version": 1;
    readonly "grantId": string;
    readonly "executionId": string;
    readonly "attemptId": string;
    readonly "revisionId": string;
    readonly "revisionDigest": string;
    readonly "principalId": string;
    readonly "csiId": string;
    readonly "scopeHash": string;
    readonly "profileHash": string;
    readonly "buildHash": string;
    readonly "currentPolicyHash": string;
    readonly "issuedAt": string;
    readonly "expiresAt": string;
}
export interface RecordingConfiguration1 {
    readonly "width": number;
    readonly "height": number;
}
export interface LearningProvenance {
    readonly "guidedModelContractHash": string;
    readonly "guidedProviderSchemaHash": string;
    readonly "guidedPromptHash": (string) | (null);
    readonly "outputContractHash": string;
    readonly "publicationResultVersion": 3;
    readonly "configuredModel": (string) | (null);
    readonly "providerReturnedModelVersion": (string) | (null);
}
export interface ValidationRequest {
    readonly "schemaVersion": 3;
    readonly "attemptId": string;
    readonly "claimId": string;
    readonly "snapshotHash": string;
    readonly "basisHash": string;
    readonly "requiredProfile": Profile;
    readonly "requiredBuild": BuildIdentity;
    readonly "artifact": Artifact3;
    readonly "validationBasis": ValidationBasis;
}
export interface ValidationBasis {
    readonly "schemaVersion": 1;
    readonly "sessionId": string;
    readonly "testId": string;
    readonly "csiId": string;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "sourceHash": string;
    readonly "configurationHash": string;
    readonly "authoringHash": string;
    readonly "sourceManifestHash": string;
    readonly "authoredInputsHash": string;
    readonly "configuration": Configuration;
    readonly "learningProvenance": LearningProvenance;
    readonly "sourceSteps": readonly ({
        readonly "stepId": string;
        readonly "ordinal": number;
        readonly "source": string;
    })[];
    readonly "scope": {
        readonly "principalId": string;
        readonly "csiId": string;
        readonly "environmentId": string;
        readonly "applicationId": string;
        readonly "approvedOrigins": readonly (string)[];
        readonly "sourceRevision": string;
        readonly "configurationRevision": string;
        readonly "modelDataPolicyId": string;
        readonly "valueTransferPolicyId": string | null;
        readonly "capabilities": readonly ("observe" | "navigate" | "click" | "fill" | "press" | "check" | "uncheck" | "selectOption" | "hover" | "read" | "assert")[];
    };
    readonly "runAuthorization": {
        readonly "authorizationId": string;
        readonly "kind": "scopedRun";
        readonly "authorizedAt": string;
        readonly "principalId": string;
        readonly "scopeHash": string;
    };
    readonly "replayRequirements": ReplayRequirements;
    readonly "bootstrap": {
        readonly "contextId": string;
        readonly "contextRevision": number;
        readonly "ownerFence": number;
        readonly "materializationRevision": number;
        readonly "inputsHash": string;
        readonly "allocationHash": string;
        readonly "metadataAcknowledged": true;
        readonly "initialEvidence": ExecutionEvidence;
    };
    readonly "translationRevision": string;
    readonly "translationHash": string;
    readonly "translationPlan": AcceptedTranslationPlan;
    readonly "sourceSelections": readonly (SourceQuestionMeaning)[];
    readonly "obligationAssociations": readonly ({
        readonly "obligationId": string;
        readonly "coordinate": {
            readonly "stepId": string;
            readonly "ordinal": number;
        };
        readonly "admissionId": string;
        readonly "proposalHash": string;
    })[];
    readonly "inputs": readonly (InputIndex)[];
    readonly "configurationReferences": readonly (ConfigReference)[];
    readonly "observations": readonly ({
        readonly "observationHash": string;
        readonly "observation": ObservedPage;
    })[];
    readonly "preparations": readonly (PreparationFact)[];
    readonly "actions": readonly (EffectiveActionFact)[];
    readonly "allocations": readonly (OriginalAllocation)[];
    readonly "producers": readonly (OriginalProducer)[];
    readonly "consumerEdges": readonly (OriginalConsumerEdge)[];
    readonly "bindings": readonly (HistoricalBinding)[];
    readonly "transfers": readonly (Transfer)[];
    readonly "materializationEvidence": MaterializationEvidence;
    readonly "incrementalEvidence": (IncrementalEvidence) | (null);
    readonly "snapshotEvidence": AuthoringSnapshot;
}
export interface AcceptedTranslationPlan {
    readonly "sourceReferences": readonly (SourceReference)[];
    readonly "obligations": readonly ({
        readonly "stepId": string;
        readonly "occurrence": number;
        readonly "operationKind": "navigate" | "click" | "fill" | "press" | "selectOption" | "check" | "uncheck" | "hover" | "read" | "assert";
        readonly "targetIntent": string;
        readonly "referenceIndex": (number) | (null);
        readonly "needId": (string) | (null);
        readonly "predicate": ("visible" | "containsText" | "hasValue" | "url" | "title") | (null);
        readonly "obligationId": string;
    })[];
    readonly "needs": readonly ({
        readonly "needId": string;
        readonly "producerStepId": string;
        readonly "consumers": readonly ({
            readonly "stepId": string;
            readonly "argumentSlot": "fill.value" | "selectOption.value" | "assert.expected";
        })[];
        readonly "bindingId": string;
    })[];
}
export interface SourceQuestionMeaning {
    readonly "need": SourceQuestionNeed;
    readonly "reference": SourceReference;
}
export interface SourceQuestionNeed {
    readonly "stepId": string;
    readonly "occurrence": number;
    readonly "operationKind": "navigate" | "fill" | "selectOption" | "assert";
    readonly "argumentSlot": "navigate.destination" | "fill.value" | "selectOption.value" | "assert.expected";
}
export interface InputIndex {
    readonly "inputId": string;
    readonly "stepId": string;
    readonly "kind": "destination" | "nonsecretText" | "secretRef";
    readonly "intendedSlot": "navigate.destination" | "fill.value" | "selectOption.value" | "assert.expected";
    readonly "provenance": SourceReference;
}
export interface ConfigReference {
    readonly "referenceId": string;
    readonly "referenceName": string;
    readonly "stepId": string;
    readonly "kind": "destination" | "nonsecretText" | "secretRef";
    readonly "intendedSlot": "navigate.destination" | "fill.value" | "selectOption.value" | "assert.expected";
    readonly "inputId": string;
}
export interface PreparationFact {
    readonly "preparationId": string;
    readonly "proposal": GuidedAction;
    readonly "proof": Preparation;
    readonly "executionEvidence": ExecutionEvidence;
    readonly "observationHash": (string) | (null);
    readonly "observedChoice"?: ObservedChoiceWitness1;
    readonly "materializationRevision": number;
}
export interface ObservedChoiceWitness1 {
    readonly "version": 1;
    readonly "receipt": ObservedChoiceReceipt1;
    readonly "context": ObservedQuestionContext;
    readonly "meanings": readonly ({
        readonly "choiceId": string;
        readonly "meaning": ObservedQuestionMeaning;
    })[];
    readonly "acceptedChoiceId": string;
    readonly "attempt": QuestionAttemptEvidence;
    readonly "questionPlan": QuestionPlanEvidence;
}
export interface ObservedChoiceReceipt1 {
    readonly "version": 1;
    readonly "sessionId": string;
    readonly "preparationId": string;
    readonly "clarificationId": string;
    readonly "obligationId": string;
    readonly "contextIdentityHash": string;
    readonly "meaningsHash": string;
    readonly "questionCaptureHash": string;
    readonly "acceptedChoiceId": string;
    readonly "answer": ObservedAnswerSnapshot;
}
export interface ObservedAnswerSnapshot {
    readonly "sessionId": string;
    readonly "scopeHash": string;
    readonly "clarificationId": string;
    readonly "coordinate": {
        readonly "stepId": string;
        readonly "ordinal": number;
    };
    readonly "documentId": string;
    readonly "generation": number;
    readonly "choiceId": string;
    readonly "nodeId": string;
    readonly "bindingId": (string) | (null);
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "resolvedAt": string;
}
export interface ObservedQuestionContext {
    readonly "sessionId": string;
    readonly "scopeHash": string;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "clarificationId": string;
    readonly "question": Clarification;
    readonly "questionCapture": QuestionCapture1;
}
export interface QuestionCapture1 {
    readonly "version": 1;
    readonly "attemptId": string;
    readonly "requestId": string;
    readonly "attempt": number;
    readonly "planRevision": string;
    readonly "planHash": string;
    readonly "obligationId": string;
    readonly "workerId": string;
    readonly "ownerFence": number;
    readonly "contextId": string;
    readonly "contextRevision": number;
    readonly "authoredInputsHash": string;
    readonly "executionEvidence": ExecutionEvidence;
    readonly "evidenceHash": string;
    readonly "observationHash": string;
    readonly "modelQuestionHash": string;
}
export interface ObservedQuestionMeaning {
    readonly "obligationId": string;
    readonly "nodeId": string;
    readonly "bindingId": (string) | (null);
    readonly "locator": ({
        readonly "kind": "role";
        readonly "role": string;
        readonly "name": string;
        readonly "exact": true;
    }) | ({
        readonly "kind": "label" | "testId" | "text" | "placeholder";
        readonly "value": string;
        readonly "exact": true;
    });
}
export interface QuestionAttemptEvidence {
    readonly "attemptId": string;
    readonly "requestId": string;
    readonly "attempt": number;
    readonly "kind": "NEXT_ACTION";
    readonly "status": "APPLIED";
    readonly "projectionHash": string;
    readonly "planRevision": string;
    readonly "scopeHash": string;
    readonly "scope": {
        readonly "principalId": string;
        readonly "csiId": string;
        readonly "environmentId": string;
        readonly "applicationId": string;
        readonly "approvedOrigins": readonly (string)[];
        readonly "sourceRevision": string;
        readonly "configurationRevision": string;
        readonly "modelDataPolicyId": string;
        readonly "valueTransferPolicyId": string | null;
        readonly "capabilities": readonly ("observe" | "navigate" | "click" | "fill" | "press" | "check" | "uncheck" | "selectOption" | "hover" | "read" | "assert")[];
    };
    readonly "owner": {
        readonly "workerId": string;
        readonly "fence": number;
        readonly "leaseExpiresAt": string;
    };
    readonly "documentId": string;
    readonly "generation": number;
    readonly "executionEvidence": ExecutionEvidence;
    readonly "responseSchemaVersion": 3;
    readonly "responseRequestId": string;
    readonly "responseKind": "NEXT_ACTION";
    readonly "responseStatus": "CLARIFICATION";
    readonly "modelQuestion": ModelObservedQuestion;
}
export interface ModelObservedQuestion {
    readonly "reason": "AMBIGUOUS_TARGET" | "AMBIGUOUS_BINDING" | "INSUFFICIENT_EVIDENCE";
    readonly "choices": readonly ({
        readonly "choiceId": string;
        readonly "safeLabel": string;
        readonly "meaning": ObservedQuestionMeaning;
    })[];
}
export interface QuestionPlanEvidence {
    readonly "revision": string;
    readonly "planHash": string;
    readonly "plan": AcceptedTranslationPlan;
}
export interface EffectiveActionFact {
    readonly "obligationId": string;
    readonly "preparationId": string;
    readonly "ledger": GuidedLedger;
}
export interface MaterializationEvidence {
    readonly "versions": readonly (MaterializationVersion)[];
    readonly "entries": readonly (InputEvidenceEntry)[];
}
export interface MaterializationVersion {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "workerId": string;
    readonly "ownerFence": number;
    readonly "scopeHash": string;
    readonly "contextId": string;
    readonly "contextRevision": number;
    readonly "authoredInputsHash": string;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "inputCount": number;
    readonly "previousInputsHash": (string) | (null);
    readonly "birthMaterializationRevision": number;
}
export interface InputEvidenceEntry {
    readonly "inputOrdinal": number;
    readonly "inputId": string;
    readonly "introducedContextRevision": number;
    readonly "inputHash": string;
    readonly "metadata": InputEvidenceMetadata;
}
export type InputEvidenceMetadata = ({
    readonly "inputId": string;
    readonly "sourceStepId": string;
    readonly "kind": "nonsecretText";
    readonly "intendedSlot": "navigate.destination" | "fill.value" | "selectOption.value" | "assert.expected";
    readonly "provenance": SourceReference;
}) | ({
    readonly "inputId": string;
    readonly "sourceStepId": string;
    readonly "kind": "destination";
    readonly "intendedSlot": "navigate.destination" | "fill.value" | "selectOption.value" | "assert.expected";
    readonly "provenance": SourceReference;
}) | ({
    readonly "inputId": string;
    readonly "sourceStepId": string;
    readonly "kind": "secretRef";
    readonly "intendedSlot": "fill.value";
    readonly "provenance": SourceReference;
    readonly "secretId": string;
});
export interface IncrementalEvidence {
    readonly "plan": RelearnPlan;
    readonly "program": PrefixProgram;
    readonly "switch": Switch;
    readonly "prefixRequests": readonly (PrefixRequestIdentity)[];
    readonly "driftReceipt": (DriftReceipt) | (null);
    readonly "firstSuffixAcceptance": FirstSuffixAcceptance;
    readonly "excludedAttempts": readonly (ExcludedAttemptFact)[];
}
export interface RelearnPlan {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "testId": string;
    readonly "csiId": string;
    readonly "baseRevisionId": string;
    readonly "initialFirstLearnStepId": string;
    readonly "initialFirstLearnIndex": number;
    readonly "prefixProgramHash": string;
}
export interface PrefixProgram {
    readonly "schemaVersion": 3;
    readonly "baseRevisionId": string;
    readonly "baseRevisionDigest": string;
    readonly "sourceStepIds": readonly (string)[];
    readonly "actions": readonly (PrefixAction)[];
}
export interface PrefixAction {
    readonly "coordinate": {
        readonly "stepId": string;
        readonly "ordinal": number;
    };
    readonly "origin": (string) | (null);
    readonly "locator": (({
        readonly "kind": "role";
        readonly "role": string;
        readonly "name": string;
        readonly "exact": true;
    }) | ({
        readonly "kind": "label" | "testId" | "text" | "placeholder";
        readonly "value": string;
        readonly "exact": true;
    })) | (null);
    readonly "operation": ({
        readonly "kind": "click" | "check" | "uncheck" | "hover";
    }) | ({
        readonly "kind": "fill";
        readonly "value": ({
            readonly "kind": "authoredLiteral";
            readonly "sourceInputId": string;
        }) | ({
            readonly "kind": "binding";
            readonly "bindingId": string;
        }) | ({
            readonly "kind": "secretRef";
            readonly "sourceInputId": string;
        });
    }) | ({
        readonly "kind": "press";
        readonly "key": "Enter" | "Tab" | "Escape" | "ArrowDown" | "ArrowUp";
    }) | ({
        readonly "kind": "selectOption";
        readonly "value": ({
            readonly "kind": "authoredLiteral";
            readonly "sourceInputId": string;
        }) | ({
            readonly "kind": "binding";
            readonly "bindingId": string;
        });
    }) | ({
        readonly "kind": "navigate";
        readonly "destinationInputId": string;
    }) | ({
        readonly "kind": "read";
        readonly "bindingId": string;
        readonly "recipe": ({
            readonly "kind": "visibleText";
            readonly "classification": "permittedBusinessData";
            readonly "policyRuleId": string;
        }) | ({
            readonly "kind": "controlValue";
            readonly "classification": "nonsecretApproved";
            readonly "controlType": "text" | "search" | "email" | "tel" | "url" | "textarea";
            readonly "policyRuleId": string;
        });
    }) | ({
        readonly "kind": "assert";
        readonly "predicate": "visible" | "containsText" | "hasValue" | "url" | "title";
        readonly "expected": (({
            readonly "kind": "authoredLiteral";
            readonly "sourceInputId": string;
        }) | ({
            readonly "kind": "binding";
            readonly "bindingId": string;
        })) | (null);
    });
    readonly "operationHash": string;
    readonly "guard": Guard;
}
export interface ExcludedAttemptFact {
    readonly "action": EffectiveActionFact;
    readonly "preparation": PreparationFact;
    readonly "obligationAssociation": {
        readonly "obligationId": string;
        readonly "coordinate": {
            readonly "stepId": string;
            readonly "ordinal": number;
        };
        readonly "admissionId": string;
        readonly "proposalHash": string;
    };
}
export interface ValidationVerdict {
    readonly "schemaVersion": 3;
    readonly "attemptId": string;
    readonly "claimId": string;
    readonly "snapshotHash": string;
    readonly "basisHash": string;
    readonly "profile": Profile;
    readonly "build": BuildIdentity;
    readonly "ok": boolean;
    readonly "artifactHash": string;
    readonly "learnedPlanHash": string;
    readonly "referencePolicyHash": string;
    readonly "operationEquivalenceHash": string;
    readonly "admissionProvenanceHash": string;
    readonly "publicationEvidenceHash": string;
    readonly "errorCode": ("INVALID_CONTRACT" | "EVIDENCE_MISMATCH" | "OPERATION_MISMATCH" | "REFERENCE_MISMATCH" | "PROFILE_MISMATCH" | "LIMIT_EXCEEDED") | (null);
}
export interface PublicationEvidencePreimage {
    readonly "version": 1;
    readonly "basisHash": string;
    readonly "runAuthorizationHash": string;
    readonly "translationHash": string;
    readonly "bootstrapHash": string;
    readonly "sourceManifestHash": string;
}
export interface RevisionReferences {
    readonly "variables": readonly (string)[];
    readonly "secrets": readonly (string)[];
    readonly "authoringIdentityVersion": 1;
    readonly "authoredDeclarations": readonly (Declaration)[];
}
export interface StepInput {
    readonly "domain": "studio.step-input";
    readonly "version": 1;
    readonly "stepId": string;
    readonly "text": string;
    readonly "context": Readonly<Record<string, unknown>>;
    readonly "references": readonly (Declaration)[];
}
export interface TestConfig {
    readonly "domain": "studio.test-config";
    readonly "version": 1;
    readonly "environment": string;
    readonly "browser": "chromium";
    readonly "viewport": {
        readonly "width": number;
        readonly "height": number;
    };
    readonly "timeoutSeconds": number;
    readonly "waitStrategy": "none" | "load" | "domcontentloaded" | "networkidle";
    readonly "globalContextHash": string;
    readonly "globalReferences": readonly (Declaration)[];
}
export interface StepChain {
    readonly "domain": "studio.step-chain";
    readonly "version": 1;
    readonly "stepId": string;
    readonly "stepInputHash": string;
    readonly "previous": string;
}
export interface StepSnapshot {
    readonly "domain": "studio.step-snapshot";
    readonly "version": 1;
    readonly "stepId": string;
    readonly "inputChain": string;
    readonly "learnedStepHash": string;
}
export interface LearnedContent {
    readonly "actions": readonly (Readonly<Record<string, unknown>>)[];
    readonly "producedBindings": readonly (Readonly<Record<string, unknown>>)[];
    readonly "consumedBindings": readonly (Readonly<Record<string, unknown>>)[];
}
export interface RunnerContext {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "workerId": string;
    readonly "ownerFence": number;
    readonly "scopeHash": string;
    readonly "contextId": string;
    readonly "contextRevision": number;
    readonly "sourceRevision": string;
    readonly "configurationRevision": string;
    readonly "versions": Versions;
    readonly "expiresAt": string;
    readonly "leaseExpiresAt": string;
    readonly "approvedOrigins": readonly (string)[];
    readonly "sourceStepIds": readonly (string)[];
    readonly "authoredInputs": AuthoredInputs;
    readonly "authoredInputsHash": string;
    readonly "materializationRevision": number;
    readonly "allocations": readonly (OriginalAllocation)[];
    readonly "producers": readonly (OriginalProducer)[];
    readonly "consumerEdges": readonly (OriginalConsumerEdge)[];
    readonly "limits": Limits;
    readonly "applicationPolicy": ObservationApplicationPolicy;
    readonly "policyHash": string;
    readonly "prefixProgram"?: PrefixProgram;
    readonly "prefixProgramHash"?: string;
}
export interface ObservationApplicationPolicy {
    readonly "policyRuleId": string;
    readonly "allowStructuralDiscovery": true;
    readonly "readGrants": readonly (ObservationReadGrant)[];
}
export interface ObservationReadGrant {
    readonly "policyRuleId": string;
    readonly "origin": string;
    readonly "region": ({
        readonly "kind": "application";
    }) | ({
        readonly "kind": "role";
        readonly "role": "main" | "region" | "form";
        readonly "name": string;
        readonly "exact": true;
    });
    readonly "visibleText"?: {
        readonly "classification": "permittedBusinessData";
    };
    readonly "controlValue"?: {
        readonly "classification": "nonsecretApproved";
        readonly "types": readonly ("text" | "search" | "email" | "tel" | "url" | "textarea")[];
    };
}
export interface MaterializationEntry {
    readonly "sessionId": string;
    readonly "inputOrdinal": number;
    readonly "inputId": string;
    readonly "introducedContextRevision": number;
    readonly "document": ({
        readonly "inputId": string;
        readonly "sourceStepId": string;
        readonly "kind": "nonsecretText";
        readonly "value": string;
        readonly "intendedSlot": "navigate.destination" | "fill.value" | "selectOption.value" | "assert.expected";
        readonly "provenance": SourceReference;
    }) | ({
        readonly "inputId": string;
        readonly "sourceStepId": string;
        readonly "kind": "destination";
        readonly "value": string;
        readonly "intendedSlot": "navigate.destination" | "fill.value" | "selectOption.value" | "assert.expected";
        readonly "provenance": SourceReference;
    }) | ({
        readonly "inputId": string;
        readonly "sourceStepId": string;
        readonly "kind": "secretRef";
        readonly "intendedSlot": "fill.value";
        readonly "provenance": SourceReference;
        readonly "secretId": string;
    });
}
export interface GuidedSession {
    readonly "schemaVersion": 3;
    readonly "sessionId": string;
    readonly "testId": string;
    readonly "state": "PREPARING" | "REPLAYING_PREFIX" | "OBSERVING" | "PROPOSING" | "ACTING" | "AWAITING_CLARIFICATION" | "FINALIZING" | "SUCCEEDED" | "PUBLICATION_CONFLICT" | "FAILED" | "UNKNOWN_OUTCOME" | "CANCELLED" | "EXPIRED";
    readonly "scope": {
        readonly "principalId": string;
        readonly "csiId": string;
        readonly "environmentId": string;
        readonly "applicationId": string;
        readonly "approvedOrigins": readonly (string)[];
        readonly "sourceRevision": string;
        readonly "configurationRevision": string;
        readonly "modelDataPolicyId": string;
        readonly "valueTransferPolicyId": string | null;
        readonly "capabilities": readonly ("observe" | "navigate" | "click" | "fill" | "press" | "check" | "uncheck" | "selectOption" | "hover" | "read" | "assert")[];
    };
    readonly "scopeHash": string;
    readonly "runAuthorization": {
        readonly "authorizationId": string;
        readonly "kind": "scopedRun";
        readonly "authorizedAt": string;
        readonly "principalId": string;
        readonly "scopeHash": string;
    };
    readonly "versions": Versions;
    readonly "owner": {
        readonly "workerId": string;
        readonly "fence": number;
        readonly "leaseExpiresAt": string;
    };
    readonly "createdAt": string;
    readonly "expiresAt": string;
    readonly "limits": Limits;
    readonly "counters": {
        readonly "actions": number;
        readonly "observations": number;
        readonly "modelProposals": number;
        readonly "modelInputTokens": number;
        readonly "modelOutputTokens": number;
        readonly "sanitizedEvidenceBytes": number;
    };
    readonly "sourceSteps": readonly ({
        readonly "stepId": string;
        readonly "requiresAssertion": boolean;
    })[];
    readonly "baseRevisionId"?: string;
    readonly "firstLearnStepId"?: string;
}
export interface SourceSelection {
    readonly "sourceReferences": readonly (SourceReference)[];
    readonly "obligations": readonly ({
        readonly "stepId": string;
        readonly "occurrence": number;
        readonly "operationKind": "navigate" | "click" | "fill" | "press" | "selectOption" | "check" | "uncheck" | "hover" | "read" | "assert";
        readonly "targetIntent": string;
        readonly "referenceIndex": (number) | (null);
        readonly "needId": (string) | (null);
        readonly "predicate": ("visible" | "containsText" | "hasValue" | "url" | "title") | (null);
    })[];
    readonly "needs": readonly ({
        readonly "needId": string;
        readonly "producerStepId": string;
        readonly "consumers": readonly ({
            readonly "stepId": string;
            readonly "argumentSlot": "fill.value" | "selectOption.value" | "assert.expected";
        })[];
    })[];
}
