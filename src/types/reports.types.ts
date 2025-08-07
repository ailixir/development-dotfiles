import type { CheckStatus } from './checks.types';

// Reports types for email-based status reporting
export interface Report {
  id: string;
  name: string;
  description: string;
  owner: string;
  recipients: string[];
  schedule: ReportSchedule;
  content: ReportContent;
  template: ReportTemplate;
  enabled: boolean;
  lastSent?: string;
  nextScheduled?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportSchedule {
  type: 'manual' | 'daily' | 'weekly' | 'monthly' | 'cron';
  time?: string; // HH:MM format
  timezone?: string;
  dayOfWeek?: number; // 0-6 for weekly (0 = Sunday)
  dayOfMonth?: number; // 1-31 for monthly
  cron?: string; // For custom schedules
}

export interface ReportContent {
  title: string;
  subtitle?: string;
  sections: ReportSection[];
}

export interface ReportSection {
  id: string;
  type: 'checks' | 'csi_summary' | 'text' | 'chart';
  title: string;
  config: ReportSectionConfig;
}

export type ReportSectionConfig = 
  | ChecksReportConfig 
  | CSISummaryConfig 
  | TextConfig 
  | ChartConfig;

export interface ChecksReportConfig {
  type: 'checks';
  checkIds: string[];
  groupBy?: 'csi' | 'type' | 'status';
  includeHistory?: boolean;
  historyDays?: number;
  statusFilter?: CheckStatus[];
}

export interface CSISummaryConfig {
  type: 'csi_summary';
  csiIds: string[];
  includeDetails?: boolean;
  healthOnly?: boolean;
}

export interface TextConfig {
  type: 'text';
  content: string;
  format: 'plain' | 'markdown';
}

export interface ChartConfig {
  type: 'chart';
  chartType: 'line' | 'bar' | 'pie' | 'donut';
  dataSource: 'checks' | 'csi';
  metric: string;
  timeRange?: string;
}

export type ReportTemplate = 'standard' | 'executive' | 'detailed' | 'custom';

// Report generation and delivery
export interface GeneratedReport {
  id: string;
  reportId: string;
  generatedAt: string;
  htmlContent: string;
  metadata: ReportMetadata;
  attachments?: ReportAttachment[];
}

export interface ReportMetadata {
  totalChecks: number;
  passingChecks: number;
  failingChecks: number;
  warningChecks: number;
  csiCount: number;
  generationTime: number; // milliseconds
  dataTimestamp: string;
}

export interface ReportAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
}

export interface ReportDelivery {
  id: string;
  reportId: string;
  generatedReportId: string;
  recipients: string[];
  deliveredAt: string;
  status: 'sent' | 'failed' | 'pending';
  error?: string;
  messageId?: string;
}

// Report creation and management
export interface CreateReportRequest {
  name: string;
  description: string;
  recipients: string[];
  schedule: ReportSchedule;
  content: ReportContent;
  template: ReportTemplate;
  enabled: boolean;
}

export interface UpdateReportRequest extends Partial<CreateReportRequest> {
  id: string;
}

export interface SendReportRequest {
  reportId: string;
  recipients?: string[]; // Override default recipients
  subject?: string; // Override default subject
}

// Report preview
export interface ReportPreview {
  htmlContent: string;
  metadata: ReportMetadata;
  estimatedSize: number;
  generatedAt: string;
}

// Report filters and search
export interface ReportFilters {
  owner?: string;
  enabled?: boolean;
  template?: ReportTemplate;
  search?: string;
  hasSchedule?: boolean;
}

// Report analytics
export interface ReportAnalytics {
  reportId: string;
  totalSent: number;
  lastSent?: string;
  averageGenerationTime: number;
  deliverySuccessRate: number;
  recipientEngagement?: RecipientEngagement[];
}

export interface RecipientEngagement {
  email: string;
  totalReceived: number;
  lastOpened?: string;
  openRate?: number;
}
