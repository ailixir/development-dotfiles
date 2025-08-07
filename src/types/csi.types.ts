// CSI (Citi System Inventory) types
export interface CSI {
  id: string;
  name: string;
  description: string;
  owner: string;
  ownerEmail: string;
  environment: 'prod' | 'uat' | 'dev' | 'test';
  businessUnit: string;
  criticality: 'critical' | 'high' | 'medium' | 'low';
  applications: CSIApplication[];
  healthStatus: 'healthy' | 'warning' | 'critical' | 'unknown';
  lastHealthCheck?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CSIApplication {
  id: string;
  name: string;
  description: string;
  version: string;
  url?: string;
  healthEndpoint?: string;
  dependencies: string[];
}

export interface CSISearchFilters {
  environment?: string;
  businessUnit?: string;
  criticality?: string;
  owner?: string;
  healthStatus?: string;
  search?: string;
}

export interface CSIHealthSummary {
  csiId: string;
  csiName: string;
  totalChecks: number;
  passingChecks: number;
  failingChecks: number;
  warningChecks: number;
  lastExecuted?: string;
  healthStatus: 'healthy' | 'warning' | 'critical' | 'unknown';
}
