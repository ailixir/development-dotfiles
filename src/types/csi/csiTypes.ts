export interface CSI {
  id: string;
  name: string;
  description: string;
  businessUnit: string;
  criticality: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  owner: string;
  tags: string[];
  environment: 'Production' | 'Staging' | 'Development';
  status: 'OPERATIONAL' | 'DEGRADED' | 'DOWN' | 'MAINTENANCE';
  createdAt: string;
  updatedAt: string;
}

export interface CSIMetrics {
  csiId: string;
  totalChecks: number;
  passingChecks: number;
  failingChecks: number;
  warningChecks: number;
  overallHealth: number; // percentage 0-100
  lastUpdated: string;
  criticalAlertsCount: number;
  avgResponseTime: number; // in milliseconds
  uptime: number; // percentage 0-100
  totalExecutions: number;
  successRate: number; // percentage 0-100
}

export interface CSIHealthSummary {
  csi: CSI;
  metrics: CSIMetrics;
  recentIncidents: number;
  maintenanceWindows: number;
  lastHealthCheck: string;
}

export interface CSIFilters {
  businessUnit?: string;
  criticality?: CSI['criticality'];
  environment?: CSI['environment'];
  status?: CSI['status'];
  searchQuery?: string;
  tags?: string[];
  tagMode?: 'AND' | 'OR';
}

// API Response types
export interface CSIListResponse {
  data: CSI[];
  total: number;
  page: number;
  limit: number;
}

export interface CSIMetricsResponse {
  data: Record<string, CSIMetrics>;
  lastUpdated: string;
}

export interface CSIHealthResponse {
  data: CSIHealthSummary[];
  timestamp: string;
}