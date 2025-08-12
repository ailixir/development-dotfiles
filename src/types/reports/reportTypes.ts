export type ReportStatus = 'active' | 'paused' | 'draft';

export type ReportTemplate = 'standard' | 'executive' | 'detailed' | 'alert-digest' | 'trend-analysis';

export interface ReportSchedule {
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
  time: string;
  timezone: string;
  enabled: boolean;
  daysOfWeek?: number[];
  daysOfMonth?: number[];
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
}

export interface ReportPreviewResponse {
  preview: string;
  generatedAt: string;
}

export type ReportExecutionStatus = 'success' | 'failed' | 'partial';

export interface ReportExecution {
  id: string;
  reportId: string;
  executionTime: string;
  status: ReportExecutionStatus;
  recipientCount: number;
  checksIncluded: number;
  checksFailures: number;
  generationDuration: number; // milliseconds
  emailContent?: string;
}

