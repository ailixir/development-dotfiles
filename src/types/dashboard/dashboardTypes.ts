export interface HealthKPI {
  totalChecks: number;
  passing: number;
  failing: number;
  warning: number;
  uptimePercent: number;
}

export interface DashboardSummary {
  overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  lastUpdated: string | null;
  counts: { passing: number; warning: number; failing: number; muted: number };
}

export interface AttentionItem {
  id: string;
  name: string;
  csiId: string;
  csiName: string;
  status: 'FAILING' | 'WARNING';
  since: string;
  reason?: string;
}

export interface ActivityItem {
  id: string;
  type: 'EXECUTION' | 'EDIT' | 'ASSIGN' | 'COMMENT';
  timestamp: string;
  title: string;
  description?: string;
  csiName?: string;
  path: string;
}

export interface ReportSnapshotItem {
  id: string;
  name: string;
  nextScheduledAt?: string;
  lastStatus?: string;
}

export interface SearchResultItem {
  id: string;
  type: 'check' | 'csi' | 'report' | 'studio' | 'CHECK' | 'REPORT';
  title: string;
  subtitle?: string;
  path: string;
}

export interface DashboardSearchState {
  loading: 'idle' | 'loading' | 'succeeded' | 'failed';
  data: SearchResultItem[];
  error: string | null;
}


