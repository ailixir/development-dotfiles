// Check types and status
export type CheckType = 
  | 'http' 
  | 'tcp' 
  | 'splunk' 
  | 'grafana' 
  | 'itrs' 
  | 'appdynamics' 
  | 'ui_test';

export type CheckStatus = 'passing' | 'failing' | 'warning' | 'unknown' | 'running';

export type ScheduleType = 'manual' | 'interval' | 'cron';

// Base check interface
export interface BaseCheck {
  id: string;
  name: string;
  description: string;
  type: CheckType;
  csiId: string;
  csiName: string;
  owner: string;
  enabled: boolean;
  schedule: CheckSchedule;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastExecuted?: string;
  lastStatus?: CheckStatus;
  lastResult?: CheckResult;
}

// Schedule configuration
export interface CheckSchedule {
  type: ScheduleType;
  interval?: number; // minutes for interval type
  cron?: string; // cron expression for cron type
  timezone?: string;
}

// Check-specific configurations
export interface HttpCheckConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  timeout: number;
  followRedirects: boolean;
  expectedStatusCodes: number[];
  expectedResponseTime?: number; // max response time in ms
  expectedContent?: string;
  authType?: 'none' | 'basic' | 'bearer' | 'api_key';
  authConfig?: Record<string, string>;
}

export interface TcpCheckConfig {
  host: string;
  port: number;
  timeout: number;
  expectedResponse?: string;
  sendData?: string;
}

export interface SplunkCheckConfig {
  query: string;
  timeRange: string; // e.g., "-15m", "-1h", "-1d"
  expectedCount?: number;
  expectedCountOperator?: 'eq' | 'gt' | 'gte' | 'lt' | 'lte';
  index?: string;
  sourcetype?: string;
  host?: string;
}

export interface GrafanaCheckConfig {
  datasource: string;
  query: string;
  timeRange: string;
  threshold: number;
  thresholdOperator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne';
  aggregation?: 'avg' | 'sum' | 'min' | 'max' | 'count';
}

export interface ITRSCheckConfig {
  sampler: string;
  dataview: string;
  column?: string;
  expectedStatus: 'OK' | 'WARNING' | 'CRITICAL';
  gateway?: string;
  probe?: string;
}

export interface AppDynamicsCheckConfig {
  application: string;
  healthRule: string;
  businessTransaction?: string;
  tier?: string;
  expectedStatus: 'NORMAL' | 'WARNING' | 'CRITICAL';
}

// Check with specific config types
export interface HttpCheck extends BaseCheck {
  type: 'http';
  config: HttpCheckConfig;
}

export interface TcpCheck extends BaseCheck {
  type: 'tcp';
  config: TcpCheckConfig;
}

export interface SplunkCheck extends BaseCheck {
  type: 'splunk';
  config: SplunkCheckConfig;
}

export interface GrafanaCheck extends BaseCheck {
  type: 'grafana';
  config: GrafanaCheckConfig;
}

export interface ITRSCheck extends BaseCheck {
  type: 'itrs';
  config: ITRSCheckConfig;
}

export interface AppDynamicsCheck extends BaseCheck {
  type: 'appdynamics';
  config: AppDynamicsCheckConfig;
}

// Union type for all checks
export type Check = 
  | HttpCheck 
  | TcpCheck 
  | SplunkCheck 
  | GrafanaCheck 
  | ITRSCheck 
  | AppDynamicsCheck;

// Check execution result
export interface CheckResult {
  id: string;
  checkId: string;
  status: CheckStatus;
  message: string;
  details?: Record<string, unknown>;
  executionTime: number; // milliseconds
  startedAt: string;
  completedAt: string;
  error?: string;
  metrics?: CheckMetrics;
}

export interface CheckMetrics {
  responseTime?: number;
  dataPoints?: number;
  bytesTransferred?: number;
  recordsFound?: number;
  customMetrics?: Record<string, number>;
}

// Check creation and update forms
export interface CreateCheckRequest {
  name: string;
  description: string;
  type: CheckType;
  csiId: string;
  config: Record<string, unknown>;
  schedule: CheckSchedule;
  tags: string[];
  enabled: boolean;
}

export interface UpdateCheckRequest extends Partial<CreateCheckRequest> {
  id: string;
}

// Check filters for listing
export interface CheckFilters {
  csiId?: string;
  type?: CheckType;
  status?: CheckStatus;
  enabled?: boolean;
  owner?: string;
  tags?: string[];
  search?: string;
}

// Check execution request
export interface ExecuteCheckRequest {
  checkId: string;
  async?: boolean;
}

export interface ExecuteCheckResponse {
  jobId: string;
  status: 'started' | 'queued';
  estimatedDuration?: number;
}
