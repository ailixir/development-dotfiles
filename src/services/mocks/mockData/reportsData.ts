export interface MockReport {
  id: string;
  name: string;
  description: string;
  selectedChecks: string[];
  schedule: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
    time: string;
    timezone: string;
    enabled: boolean;
    daysOfWeek?: number[];
    daysOfMonth?: number[];
    cron?: string;
  };
  recipients: string[];
  template: 'standard' | 'executive' | 'detailed' | 'alert-digest' | 'trend-analysis';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastSent?: string;
  status: 'active' | 'paused' | 'draft';
  sections?: Array<{
    id: string;
    title: string;
    kind: 'manual' | 'rule';
    checkIds?: string[];
    rule?: {
      csiIds?: string[];
      tags?: string[];
      types?: string[];
      status?: string[];
      timeframe?: '' | '5m' | '15m' | '1h' | '24h';
      sort?: '' | 'failing-first' | 'recently-failed' | 'alphabetical';
      limit?: number;
    };
  }>;
}

export const mockReports: MockReport[] = [
  {
    id: 'report-001',
    name: 'Daily Trading System Health',
    description: 'Daily summary of critical trading system health checks',
    selectedChecks: ['check-001', 'check-002', 'check-003'],
    schedule: {
      frequency: 'daily',
      time: '06:00',
      timezone: 'EST',
      enabled: true
    },
    recipients: [
      'robert.kim@citi.com',
      'trading-ops@citi.com',
      'david.chen@citi.com'
    ],
    template: 'standard',
    createdAt: '2024-01-10T09:00:00Z',
    updatedAt: '2024-01-15T08:30:00Z',
    createdBy: 'david.chen@citi.com',
    lastSent: '2024-01-15T06:00:00Z',
    status: 'active'
  },
  {
    id: 'report-002',
    name: 'Weekly Infrastructure Overview',
    description: 'Comprehensive weekly report on infrastructure health across all systems',
    selectedChecks: ['check-001', 'check-002', 'check-004', 'check-005'],
    schedule: {
      frequency: 'weekly',
      time: '09:00',
      timezone: 'EST',
      enabled: true,
      daysOfWeek: [1] // Monday
    },
    recipients: [
      'robert.kim@citi.com',
      'infrastructure-team@citi.com',
      'operations-leads@citi.com'
    ],
    template: 'detailed',
    createdAt: '2024-01-08T10:00:00Z',
    updatedAt: '2024-01-14T12:00:00Z',
    createdBy: 'maria.garcia@citi.com',
    lastSent: '2024-01-14T09:00:00Z',
    status: 'active'
  },
  {
    id: 'report-003',
    name: 'Customer Portal Status',
    description: 'Real-time status report for customer-facing applications',
    selectedChecks: ['check-006', 'check-007'],
    schedule: {
      frequency: 'daily',
      time: '18:00',
      timezone: 'EST',
      enabled: false
    },
    recipients: [
      'customer-ops@citi.com',
      'sarah.johnson@citi.com'
    ],
    template: 'standard',
    createdAt: '2024-01-12T14:00:00Z',
    updatedAt: '2024-01-12T14:00:00Z',
    createdBy: 'priya.sharma@citi.com',
    status: 'draft',
    sections: [
      { id: 'section-1', title: 'Critical Services', kind: 'rule', rule: { status: ['FAILING', 'WARNING'], sort: 'failing-first', limit: 10 } },
      { id: 'section-2', title: 'Core Checks', kind: 'manual', checkIds: ['check-001','check-002'] }
    ]
  }
];

export interface MockReportExecution {
  id: string;
  reportId: string;
  executionTime: string;
  status: 'success' | 'failed' | 'partial';
  recipientCount: number;
  checksIncluded: number;
  checksFailures: number;
  generationDuration: number;
  emailContent?: string;
}

export const mockReportExecutions: MockReportExecution[] = [
  {
    id: 'exec-report-001',
    reportId: 'report-001',
    executionTime: '2024-01-15T06:00:00Z',
    status: 'success',
    recipientCount: 3,
    checksIncluded: 3,
    checksFailures: 1,
    generationDuration: 2340,
    emailContent: `
Subject: Daily Trading System Health Report - Jan 15, 2024

Good morning,

Here's your daily health summary for the Trading System:

OVERALL STATUS: WARNING (1 of 3 checks failing)

✅ Trade API Health Check (123456)
   Status: PASSING (last 16 hours)
   
✅ Database Connection Pool (123456) 
   Status: PASSING (last 8 hours)
   
⚠️ Trade Settlement Log Analysis (123456)
   Status: WARNING (last 23 minutes)
   Issue: Settlement delays detected in Splunk logs
   [Investigate in Checks →]

Generated at 6:00 AM EST on Jan 15, 2024
Next report: Jan 16, 2024 at 6:00 AM EST
    `
  }
];