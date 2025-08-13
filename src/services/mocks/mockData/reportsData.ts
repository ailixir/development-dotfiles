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
      'emanuel.stanciu@citi.com',
      'trading-ops@citi.com',
      'bruno.buger@citi.com'
    ],
    template: 'standard',
    createdAt: '2024-01-10T09:00:00Z',
    updatedAt: '2024-01-15T08:30:00Z',
    createdBy: 'bruno.buger@citi.com',
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
      'emanuel.stanciu@citi.com',
      'infrastructure-team@citi.com',
      'operations-leads@citi.com'
    ],
    template: 'detailed',
    createdAt: '2024-01-08T10:00:00Z',
    updatedAt: '2024-01-14T12:00:00Z',
    createdBy: 'matthew.robinson@citi.com',
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
      'bruno.buger@citi.com'
    ],
    template: 'standard',
    createdAt: '2024-01-12T14:00:00Z',
    updatedAt: '2024-01-12T14:00:00Z',
    createdBy: 'bruno.buger@citi.com',
    status: 'paused',
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
    emailContent: `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Checks Report</title>
  <style>body { margin:0; padding:0; }</style>
  </head>
  <body style="margin:0;padding:0;background:#F3F4F6;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F3F4F6;padding:20px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
            <tr>
              <td style="padding:16px 20px;border-bottom:1px solid #E5E7EB;background:#0F172A;color:#ffffff;">
                <div style="font-size:16px;font-weight:700;">Checks Report</div>
                <div style="font-size:12px;opacity:0.85;">Jan 15, 2024, 6:00 AM EST</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px;">
                <div style="font-size:18px;color:#111827;font-weight:700;margin-bottom:4px;">Daily Trading System Health</div>
                <div style="font-size:13px;color:#6B7280;margin-bottom:12px;">Overall Status: <span style="color:#ED6C02;font-weight:700;">WARNING</span></div>
                <div style="font-size:12px;color:#6B7280;margin-bottom:12px;">Schedule: daily at 06:00 EST</div>
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0;">
                  <thead>
                    <tr>
                      <th colspan="2" style="text-align:left;padding:8px 12px;background:#F5F7FA;color:#374151;border:1px solid #eee;border-bottom:none;font-size:14px;">Selected Checks</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style="padding:8px 12px;border-bottom:1px solid #eee;">Trade API Health Check<div style="color:#757575;font-size:12px;">CSI 123456</div></td>
                      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;"><span style="display:inline-block;padding:4px 8px;border-radius:16px;background:#2E7D32;color:#fff;font-size:12px;">PASSING</span></td>
                    </tr>
                    <tr>
                      <td style="padding:8px 12px;border-bottom:1px solid #eee;">Database Connection Pool<div style="color:#757575;font-size:12px;">CSI 123456</div></td>
                      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;"><span style="display:inline-block;padding:4px 8px;border-radius:16px;background:#2E7D32;color:#fff;font-size:12px;">PASSING</span></td>
                    </tr>
                    <tr>
                      <td style="padding:8px 12px;border-bottom:1px solid #eee;">Trade Settlement Log Analysis<div style="color:#757575;font-size:12px;">CSI 123456</div></td>
                      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;"><span style="display:inline-block;padding:4px 8px;border-radius:16px;background:#ED6C02;color:#fff;font-size:12px;">WARNING</span></td>
                    </tr>
                  </tbody>
                </table>
                <div style="border-top:1px solid #E5E7EB;margin-top:12px;padding-top:12px;font-size:12px;color:#6B7280;">Total Checks: 3</div>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 20px;background:#F9FAFB;border-top:1px solid #E5E7EB;color:#6B7280;font-size:11px;">Generated by PUT Checks</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
  }
];