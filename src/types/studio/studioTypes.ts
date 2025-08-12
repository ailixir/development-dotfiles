export type StepActionType =
  | 'go_to'
  | 'click'
  | 'type'
  | 'wait_for_text'
  | 'check_url_contains';

export interface SecretRef {
  id: string;
  label: string;
  scope: 'project' | 'org' | 'user';
  last4?: string;
  createdAt: string;
}

export type VariableValue =
  | { kind: 'plain'; value: string }
  | { kind: 'secret'; ref: SecretRef };

export interface VariableDefinition {
  name: string; // e.g., USERNAME, PASSWORD
  value: VariableValue;
}

export interface StepIRBase {
  id: string; // stable identifier for mapping
  index: number;
  originalText: string;
}

export interface GoToStepIR extends StepIRBase {
  type: 'go_to';
  url: string;
}

export interface ClickStepIR extends StepIRBase {
  type: 'click';
  targetText?: string; // e.g., Login
  roleHint?: 'button' | 'link' | 'checkbox' | 'textbox' | 'combobox' | 'menuitem' | 'none';
}

export interface TypeStepIR extends StepIRBase {
  type: 'type';
  targetFieldText?: string; // e.g., User ID
  value: { raw?: string; varName?: string; secretId?: string };
}

export interface WaitForTextStepIR extends StepIRBase {
  type: 'wait_for_text';
  text: string;
  timeoutMs?: number;
}

export interface CheckUrlContainsStepIR extends StepIRBase {
  type: 'check_url_contains';
  substring: string;
}

export type StepIR =
  | GoToStepIR
  | ClickStepIR
  | TypeStepIR
  | WaitForTextStepIR
  | CheckUrlContainsStepIR;

export interface TestIR {
  meta: {
    name: string;
    csiId?: string;
    description?: string;
  };
  environment: string; // Development, Staging, etc.
  configuration: {
    browser: 'chrome' | 'firefox' | 'safari' | 'edge';
    viewport: { width: number; height: number };
    timeout: number;
    waitStrategy: 'none' | 'networkidle' | 'domcontentloaded';
  };
  variables: VariableDefinition[];
  steps: StepIR[];
}


