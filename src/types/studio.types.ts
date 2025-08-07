// UI Testing Studio types
export interface UITest {
  id: string;
  name: string;
  description: string;
  csiId: string;
  csiName: string;
  steps: TestStep[];
  owner: string;
  enabled: boolean;
  schedule?: TestSchedule;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastExecuted?: string;
  lastStatus?: TestStatus;
  lastResult?: any; // TestResult - will be defined later
}

export interface TestStep {
  id: string;
  order: number;
  command: string; // Plain English command
  parameters?: Record<string, string>;
  timeout?: number;
  screenshot?: boolean;
  description?: string;
  status?: StepStatus;
  error?: string;
  executionTime?: number;
}

export type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export type TestStatus = 'passing' | 'failing' | 'running' | 'pending' | 'cancelled';

export interface TestSchedule {
  type: 'manual' | 'interval' | 'cron';
  interval?: number; // minutes
  cron?: string;
  timezone?: string;
}

// Test execution
export interface TestExecution {
  id: string;
  testId: string;
  status: TestStatus;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  steps: TestStepResult[];
  videoUrl?: string;
  screenshots: TestScreenshot[];
  logs: TestLogEntry[];
  error?: string;
  browser?: BrowserInfo;
}

export interface TestStepResult {
  stepId: string;
  order: number;
  command: string;
  status: StepStatus;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  screenshot?: string;
  error?: string;
  data?: Record<string, unknown>;
}

export interface TestScreenshot {
  id: string;
  stepId?: string;
  url: string;
  timestamp: string;
  description?: string;
}

export interface TestLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  stepId?: string;
  data?: Record<string, unknown>;
}

export interface BrowserInfo {
  name: string;
  version: string;
  platform: string;
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
}

// Studio UI state
export interface StudioState {
  currentTest?: UITest;
  isEditing: boolean;
  isExecuting: boolean;
  executionId?: string;
  currentStep?: number;
  execution?: TestExecution;
  videoPlayer?: VideoPlayerState;
}

export interface VideoPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  selectedStep?: number | null;
}

// Test commands supported by the studio
export interface TestCommand {
  name: string;
  syntax: string;
  description: string;
  examples: string[];
  parameters: CommandParameter[];
  category: CommandCategory;
}

export interface CommandParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'selector';
  required: boolean;
  description: string;
  examples?: string[];
}

export type CommandCategory = 
  | 'navigation' 
  | 'interaction' 
  | 'assertion' 
  | 'wait' 
  | 'data';

// Create/update requests
export interface CreateUITestRequest {
  name: string;
  description: string;
  csiId: string;
  steps: Omit<TestStep, 'id' | 'status' | 'error' | 'executionTime'>[];
  schedule?: TestSchedule;
  tags: string[];
  enabled: boolean;
}

export interface UpdateUITestRequest extends Partial<CreateUITestRequest> {
  id: string;
}

export interface ExecuteUITestRequest {
  testId: string;
  async?: boolean;
  recordVideo?: boolean;
  takeScreenshots?: boolean;
  browser?: 'chrome' | 'firefox' | 'safari';
  viewport?: {
    width: number;
    height: number;
  };
}

export interface ExecuteUITestResponse {
  executionId: string;
  status: 'started' | 'queued';
  estimatedDuration?: number;
  streamUrl?: string; // For real-time viewing
}
