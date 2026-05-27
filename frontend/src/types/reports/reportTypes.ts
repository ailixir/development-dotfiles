export type ReportStatus = 'ACTIVE' | 'PAUSED' | 'DRAFT';

export type ReportTemplate = 'standard' | 'executive' | 'detailed' | 'alert-digest' | 'trend-analysis';

export interface ReportSchedule {
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
  time: string;
  timezone: string;
  enabled: boolean;
  daysOfWeek?: number[];
  daysOfMonth?: number[];
  cron?: string;
}

export interface ReportEntity {
  id: string;
  name: string;
  description: string;
  selectedChecks: string[];
  schedule: ReportSchedule;
  recipients: string[];
  template: ReportTemplate;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastSent?: string;
  status: ReportStatus;
}

export interface ReportConfiguration {
  name: string;
  description: string;
  selectedChecks: string[];
  schedule: ReportSchedule;
  recipients: string[];
  template: ReportTemplate;
  sections?: ReportSection[];
}

export interface ReportPreviewResponse {
  preview: string;
  generatedAt: string;
  html?: string;
}

export type ReportExecutionStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL';

export interface ReportExecution {
  id: string;
  reportId: string;
  executedAt: string;
  status: ReportExecutionStatus;
  recipientCount: number;
  checksIncluded: number;
  checksFailed: number;
  generationDurationMs: number;
  emailContent?: string;
  errorMessage?: string;
  createdAt?: string;
}

// Report sections enable grouped content within a report
export type ReportSectionKind = 'manual' | 'rule';

export interface ManualReportSection {
  id: string;
  title: string;
  kind: 'manual';
  checkIds: string[];
}

export interface RuleConfig {
  csiIds?: string[];
  tags?: string[];
  types?: string[];
  status?: string[];
  timeframe?: '' | '5m' | '15m' | '1h' | '24h';
  sort?: '' | 'failing-first' | 'recently-failed' | 'alphabetical';
  limit?: number;
}

export interface RuleReportSection {
  id: string;
  title: string;
  kind: 'rule';
  rule: RuleConfig;
}

export type ReportSection = ManualReportSection | RuleReportSection;

