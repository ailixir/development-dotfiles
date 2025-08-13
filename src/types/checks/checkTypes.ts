export type CheckType = 'HTTP' | 'TCP' | 'SPLUNK' | 'GRAFANA' | 'ITRS' | 'APPDYNAMICS' | 'UI_TEST';
export type CheckStatus = 'PASSING' | 'FAILING' | 'WARNING' | 'PENDING' | 'UNKNOWN';
export type ExecutionStatus = 'SUCCESS' | 'FAILURE' | 'WARNING' | 'TIMEOUT';

export interface CheckEntity {
  id: string;
  name: string;
  type: CheckType;
  csiId: string;
  csiName: string;
  status: CheckStatus;
  lastExecution: string | null;
  nextExecution: string | null;
  configuration: CheckConfiguration;
  schedule: CheckSchedule;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  description?: string;
  environment?: string;
}

export interface CheckConfiguration {
  // HTTP Configuration
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  expectedStatus?: number;
  timeout?: number;

  // TCP Configuration
  host?: string;
  port?: number;

  // Splunk Configuration
  query?: string;
  timeRange?: string;
  threshold?: ThresholdConfig;

  // Grafana Configuration
  datasource?: string;
  duration?: string;

  // ITRS Configuration
  gateway?: string;
  sampler?: string;
  dataitem?: string;
  expectedValue?: string;

  // AppDynamics Configuration
  application?: string;
  healthRule?: string;
  tier?: string;

  // UI Test Configuration
  uiTest?: {
    testId: string;
    variables?: Record<string, { kind: 'plain' | 'secret' | 'number' | 'boolean'; value?: string | number; secretId?: string }>;
    overrides?: {
      browser?: 'chrome' | 'firefox' | 'safari' | 'edge';
      viewport?: { width: number; height: number };
      timeout?: number;
    };
  };
}

export interface ThresholdConfig {
  operator: 'greater_than' | 'less_than' | 'equals' | 'not_equals' | 'contains';
  value: number | string;
  duration?: string;
}

export interface CheckSchedule {
  frequency: string;
  timezone: string;
  enabled: boolean;
  daysOfWeek?: number[];
  time?: string;
  cron?: string;
}

export interface CreateCheckRequest {
  name: string;
  type: CheckType;
  csiId: string;
  description?: string;
  configuration: CheckConfiguration;
  schedule: CheckSchedule;
  tags?: string[];
}

export interface UpdateCheckRequest extends Partial<CreateCheckRequest> {
  id: string;
}

export interface ExecutionResult {
  id: string;
  checkId: string;
  status: ExecutionStatus;
  startTime: string;
  endTime: string;
  duration: number;
  output: string;
  metadata: Record<string, any>;
  error?: string;
}

export interface CheckFilters {
  csiId: string | null;
  status: CheckStatus | null;
  type: CheckType | null;
  searchQuery: string;
  tags?: string[];
}

export interface CheckStatistics {
  total: number;
  passing: number;
  failing: number;
  warning: number;
  pending: number;
  scheduled: number;
}