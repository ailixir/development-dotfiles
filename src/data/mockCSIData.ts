import { CSI, CSIMetrics, CSIHealthSummary } from '../types/csi/csiTypes';

// Mock CSI data representing Citi's systems
export const mockCSIs: CSI[] = [
  {
    id: '172087',
    name: 'Automated Management of Production',
    description: 'Automated systems for managing production workloads and deployments',
    businessUnit: 'Technology Infrastructure',
    criticality: 'CRITICAL',
    owner: 'platform-automation@citi.com',
    tags: ['automation', 'production', 'deployment', 'infrastructure', 'critical'],
    environment: 'Production',
    status: 'OPERATIONAL',
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2025-01-07T10:30:00Z'
  },
  {
    id: '168942',
    name: 'Core Banking Platform',
    description: 'Primary banking services and transaction processing systems',
    businessUnit: 'Consumer Banking',
    criticality: 'CRITICAL',
    owner: 'core-banking@citi.com',
    tags: ['banking', 'transactions', 'core-systems', 'api', 'critical', 'database'],
    environment: 'Production',
    status: 'OPERATIONAL',
    createdAt: '2023-08-20T00:00:00Z',
    updatedAt: '2025-01-07T10:25:00Z'
  },
  {
    id: '174523',
    name: 'Trading Platform Services',
    description: 'Electronic trading systems and market data processing',
    businessUnit: 'Markets & Securities',
    criticality: 'CRITICAL',
    owner: 'trading-platform@citi.com',
    tags: ['trading', 'market-data', 'securities', 'api', 'critical', 'performance', 'business-critical'],
    environment: 'Production',
    status: 'DEGRADED',
    createdAt: '2023-11-10T00:00:00Z',
    updatedAt: '2025-01-07T10:20:00Z'
  },
  {
    id: '169834',
    name: 'Payment Gateway Infrastructure',
    description: 'Payment processing and gateway services for all channels',
    businessUnit: 'Payments',
    criticality: 'CRITICAL',
    owner: 'payments-infra@citi.com',
    tags: ['payments', 'gateway', 'processing', 'api', 'critical', 'customer-facing'],
    environment: 'Production',
    status: 'OPERATIONAL',
    createdAt: '2024-02-01T00:00:00Z',
    updatedAt: '2025-01-07T10:35:00Z'
  },
  {
    id: '171205',
    name: 'Risk Management Systems',
    description: 'Credit risk, market risk, and operational risk management platforms',
    businessUnit: 'Risk Management',
    criticality: 'HIGH',
    owner: 'risk-systems@citi.com',
    tags: ['risk', 'compliance', 'analytics', 'monitoring', 'reporting', 'regulatory'],
    environment: 'Production',
    status: 'OPERATIONAL',
    createdAt: '2024-03-15T00:00:00Z',
    updatedAt: '2025-01-07T10:15:00Z'
  },
  {
    id: '170456',
    name: 'Customer Digital Platform',
    description: 'Online and mobile banking platforms for customer interactions',
    businessUnit: 'Digital Banking',
    criticality: 'HIGH',
    owner: 'digital-platform@citi.com',
    tags: ['digital', 'customer', 'mobile', 'web', 'ui-test', 'customer-facing', 'login'],
    environment: 'Production',
    status: 'OPERATIONAL',
    createdAt: '2024-01-30T00:00:00Z',
    updatedAt: '2025-01-07T10:40:00Z'
  },
  {
    id: '173681',
    name: 'Data Analytics Platform',
    description: 'Business intelligence and analytics processing systems',
    businessUnit: 'Data & Analytics',
    criticality: 'MEDIUM',
    owner: 'analytics-platform@citi.com',
    tags: ['analytics', 'data', 'intelligence', 'reporting', 'dashboard', 'metrics'],
    environment: 'Production',
    status: 'OPERATIONAL',
    createdAt: '2024-04-10T00:00:00Z',
    updatedAt: '2025-01-07T10:10:00Z'
  },
  {
    id: '167823',
    name: 'Infrastructure Services',
    description: 'Core infrastructure including network, storage, and compute services',
    businessUnit: 'Infrastructure',
    criticality: 'HIGH',
    owner: 'infrastructure@citi.com',
    tags: ['infrastructure', 'network', 'storage', 'compute', 'tcp', 'database', 'performance'],
    environment: 'Production',
    status: 'OPERATIONAL',
    createdAt: '2023-06-01T00:00:00Z',
    updatedAt: '2025-01-07T10:45:00Z'
  },
  {
    id: '175209',
    name: 'Compliance Monitoring Systems',
    description: 'Regulatory compliance and monitoring applications',
    businessUnit: 'Compliance',
    criticality: 'HIGH',
    owner: 'compliance-systems@citi.com',
    tags: ['compliance', 'regulatory', 'monitoring', 'audit', 'logs', 'reporting'],
    environment: 'Production',
    status: 'MAINTENANCE',
    createdAt: '2024-05-20T00:00:00Z',
    updatedAt: '2025-01-07T10:00:00Z'
  },
  {
    id: '172954',
    name: 'Security Operations Platform',
    description: 'Cybersecurity monitoring and incident response systems',
    businessUnit: 'Cybersecurity',
    criticality: 'CRITICAL',
    owner: 'security-ops@citi.com',
    tags: ['security', 'monitoring', 'incident-response', 'critical', 'alerts', 'siem'],
    environment: 'Production',
    status: 'OPERATIONAL',
    createdAt: '2024-06-15T00:00:00Z',
    updatedAt: '2025-01-07T10:50:00Z'
  }
];

// Mock CSI metrics data
export const mockCSIMetrics: Record<string, CSIMetrics> = {
  '172087': {
    csiId: '172087',
    totalChecks: 12,
    passingChecks: 10,
    failingChecks: 1,
    warningChecks: 1,
    overallHealth: 85.5,
    lastUpdated: '2025-01-07T10:30:00Z',
    criticalAlertsCount: 1,
    avgResponseTime: 156,
    uptime: 99.2,
    totalExecutions: 288,
    successRate: 94.8
  },
  '168942': {
    csiId: '168942',
    totalChecks: 18,
    passingChecks: 16,
    failingChecks: 0,
    warningChecks: 2,
    overallHealth: 92.3,
    lastUpdated: '2025-01-07T10:25:00Z',
    criticalAlertsCount: 0,
    avgResponseTime: 89,
    uptime: 99.9,
    totalExecutions: 432,
    successRate: 98.1
  },
  '174523': {
    csiId: '174523',
    totalChecks: 8,
    passingChecks: 5,
    failingChecks: 2,
    warningChecks: 1,
    overallHealth: 71.2,
    lastUpdated: '2025-01-07T10:20:00Z',
    criticalAlertsCount: 2,
    avgResponseTime: 234,
    uptime: 97.8,
    totalExecutions: 192,
    successRate: 89.3
  },
  '169834': {
    csiId: '169834',
    totalChecks: 15,
    passingChecks: 14,
    failingChecks: 0,
    warningChecks: 1,
    overallHealth: 96.1,
    lastUpdated: '2025-01-07T10:35:00Z',
    criticalAlertsCount: 0,
    avgResponseTime: 112,
    uptime: 99.95,
    totalExecutions: 360,
    successRate: 99.2
  },
  '171205': {
    csiId: '171205',
    totalChecks: 10,
    passingChecks: 9,
    failingChecks: 0,
    warningChecks: 1,
    overallHealth: 94.7,
    lastUpdated: '2025-01-07T10:15:00Z',
    criticalAlertsCount: 0,
    avgResponseTime: 145,
    uptime: 99.7,
    totalExecutions: 240,
    successRate: 97.5
  },
  '170456': {
    csiId: '170456',
    totalChecks: 14,
    passingChecks: 12,
    failingChecks: 1,
    warningChecks: 1,
    overallHealth: 88.9,
    lastUpdated: '2025-01-07T10:40:00Z',
    criticalAlertsCount: 1,
    avgResponseTime: 178,
    uptime: 99.1,
    totalExecutions: 336,
    successRate: 95.2
  },
  '173681': {
    csiId: '173681',
    totalChecks: 6,
    passingChecks: 6,
    failingChecks: 0,
    warningChecks: 0,
    overallHealth: 100.0,
    lastUpdated: '2025-01-07T10:10:00Z',
    criticalAlertsCount: 0,
    avgResponseTime: 98,
    uptime: 99.8,
    totalExecutions: 144,
    successRate: 100.0
  },
  '167823': {
    csiId: '167823',
    totalChecks: 22,
    passingChecks: 20,
    failingChecks: 1,
    warningChecks: 1,
    overallHealth: 93.2,
    lastUpdated: '2025-01-07T10:45:00Z',
    criticalAlertsCount: 1,
    avgResponseTime: 123,
    uptime: 99.5,
    totalExecutions: 528,
    successRate: 96.8
  },
  '175209': {
    csiId: '175209',
    totalChecks: 7,
    passingChecks: 5,
    failingChecks: 0,
    warningChecks: 2,
    overallHealth: 82.1,
    lastUpdated: '2025-01-07T10:00:00Z',
    criticalAlertsCount: 0,
    avgResponseTime: 167,
    uptime: 98.9,
    totalExecutions: 168,
    successRate: 92.9
  },
  '172954': {
    csiId: '172954',
    totalChecks: 16,
    passingChecks: 15,
    failingChecks: 0,
    warningChecks: 1,
    overallHealth: 97.3,
    lastUpdated: '2025-01-07T10:50:00Z',
    criticalAlertsCount: 0,
    avgResponseTime: 87,
    uptime: 99.9,
    totalExecutions: 384,
    successRate: 98.7
  }
};

// Generate CSI health summaries
export const mockCSIHealthSummaries: CSIHealthSummary[] = mockCSIs.map(csi => ({
  csi,
  metrics: mockCSIMetrics[csi.id],
  recentIncidents: csi.status === 'DEGRADED' ? 2 : csi.status === 'DOWN' ? 3 : Math.floor(Math.random() * 2),
  maintenanceWindows: csi.status === 'MAINTENANCE' ? 1 : 0,
  lastHealthCheck: mockCSIMetrics[csi.id]?.lastUpdated || new Date().toISOString()
}));

// Business unit groupings for filtering
export const businessUnits = [
  'Technology Infrastructure',
  'Consumer Banking', 
  'Markets & Securities',
  'Payments',
  'Risk Management',
  'Digital Banking',
  'Data & Analytics',
  'Infrastructure',
  'Compliance',
  'Cybersecurity'
];

// Helper functions
export const getCSIById = (id: string): CSI | undefined => {
  return mockCSIs.find(csi => csi.id === id);
};

export const getCSIMetrics = (csiId: string): CSIMetrics | undefined => {
  return mockCSIMetrics[csiId];
};

export const getCSIsByBusinessUnit = (businessUnit: string): CSI[] => {
  return mockCSIs.filter(csi => csi.businessUnit === businessUnit);
};

export const getCSIsByCriticality = (criticality: CSI['criticality']): CSI[] => {
  return mockCSIs.filter(csi => csi.criticality === criticality);
};

export const getCriticalCSIs = (): CSI[] => {
  return mockCSIs.filter(csi => csi.criticality === 'CRITICAL');
};