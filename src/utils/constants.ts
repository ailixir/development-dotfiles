import { ENV_CONFIG } from './env';

// Application configuration
export const APP_CONFIG = {
  name: 'PUT Checks Module',
  version: '1.0.0',
  modulePort: 3002,
  enableMSW: ENV_CONFIG.enableMSW,
  debugMode: ENV_CONFIG.debugMode,
  apiBaseUrl: ENV_CONFIG.apiBaseUrl,
} as const;

// API endpoints
export const API_ENDPOINTS = {
  checks: '/checks',
  csi: '/csi',
  execution: '/execution',
  reports: '/reports',
  studio: '/studio',
} as const;

// Check type definitions with display information
export const CHECK_TYPES = {
  http: {
    id: 'http',
    name: 'HTTP/HTTPS',
    description: 'Monitor HTTP endpoints and APIs',
    icon: 'globe',
    category: 'basic',
    color: '#2196F3',
  },
  tcp: {
    id: 'tcp',
    name: 'TCP Port',
    description: 'Check TCP port connectivity',
    icon: 'settings_ethernet',
    category: 'basic',
    color: '#4CAF50',
  },
  splunk: {
    id: 'splunk',
    name: 'Splunk Query',
    description: 'Execute Splunk search queries',
    icon: 'search',
    category: 'integration',
    color: '#FF9800',
  },
  grafana: {
    id: 'grafana',
    name: 'Grafana Metric',
    description: 'Monitor Grafana metrics and thresholds',
    icon: 'analytics',
    category: 'integration',
    color: '#FF5722',
  },
  itrs: {
    id: 'itrs',
    name: 'ITRS Geneos',
    description: 'Check ITRS Geneos sampler status',
    icon: 'monitoring',
    category: 'integration',
    color: '#9C27B0',
  },
  appdynamics: {
    id: 'appdynamics',
    name: 'AppDynamics',
    description: 'Monitor AppDynamics health rules',
    icon: 'speed',
    category: 'integration',
    color: '#607D8B',
  },
  ui_test: {
    id: 'ui_test',
    name: 'UI Test',
    description: 'Browser-based UI testing',
    icon: 'web',
    category: 'testing',
    color: '#E91E63',
  },
} as const;

// Status configurations
export const CHECK_STATUS = {
  passing: {
    id: 'passing',
    name: 'Passing',
    color: '#4CAF50',
    icon: 'check_circle',
    severity: 0,
  },
  warning: {
    id: 'warning',
    name: 'Warning',
    color: '#FF9800',
    icon: 'warning',
    severity: 1,
  },
  failing: {
    id: 'failing',
    name: 'Failing',
    color: '#F44336',
    icon: 'error',
    severity: 2,
  },
  unknown: {
    id: 'unknown',
    name: 'Unknown',
    color: '#9E9E9E',
    icon: 'help',
    severity: 3,
  },
  running: {
    id: 'running',
    name: 'Running',
    color: '#2196F3',
    icon: 'play_circle',
    severity: 4,
  },
} as const;

// CSI environment types
export const CSI_ENVIRONMENTS = {
  prod: {
    id: 'prod',
    name: 'Production',
    color: '#F44336',
    description: 'Live production environment',
  },
  uat: {
    id: 'uat',
    name: 'UAT',
    color: '#FF9800',
    description: 'User Acceptance Testing',
  },
  dev: {
    id: 'dev',
    name: 'Development',
    color: '#4CAF50',
    description: 'Development environment',
  },
  test: {
    id: 'test',
    name: 'Test',
    color: '#2196F3',
    description: 'Testing environment',
  },
} as const;

// CSI criticality levels
export const CSI_CRITICALITY = {
  critical: {
    id: 'critical',
    name: 'Critical',
    color: '#F44336',
    priority: 1,
    description: 'Business critical systems',
  },
  high: {
    id: 'high',
    name: 'High',
    color: '#FF9800',
    priority: 2,
    description: 'High importance systems',
  },
  medium: {
    id: 'medium',
    name: 'Medium',
    color: '#FFC107',
    priority: 3,
    description: 'Medium importance systems',
  },
  low: {
    id: 'low',
    name: 'Low',
    color: '#4CAF50',
    priority: 4,
    description: 'Low importance systems',
  },
} as const;

// Schedule types
export const SCHEDULE_TYPES = {
  manual: {
    id: 'manual',
    name: 'Manual',
    description: 'Execute manually only',
    icon: 'play_arrow',
  },
  interval: {
    id: 'interval',
    name: 'Interval',
    description: 'Execute at regular intervals',
    icon: 'schedule',
  },
  cron: {
    id: 'cron',
    name: 'Cron',
    description: 'Execute based on cron expression',
    icon: 'event',
  },
} as const;

// Predefined intervals (in minutes)
export const PREDEFINED_INTERVALS = [
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 240, label: '4 hours' },
  { value: 480, label: '8 hours' },
  { value: 720, label: '12 hours' },
  { value: 1440, label: '24 hours' },
] as const;

// Report templates
export const REPORT_TEMPLATES = {
  standard: {
    id: 'standard',
    name: 'Standard Report',
    description: 'Basic status report with checks overview',
  },
  executive: {
    id: 'executive',
    name: 'Executive Summary',
    description: 'High-level summary for management',
  },
  detailed: {
    id: 'detailed',
    name: 'Detailed Report',
    description: 'Comprehensive report with full details',
  },
  custom: {
    id: 'custom',
    name: 'Custom Template',
    description: 'User-defined custom template',
  },
} as const;

// Studio commands categories
export const STUDIO_COMMAND_CATEGORIES = {
  navigation: {
    id: 'navigation',
    name: 'Navigation',
    description: 'Navigate between pages and URLs',
    color: '#2196F3',
  },
  interaction: {
    id: 'interaction',
    name: 'Interaction',
    description: 'Click, type, and interact with elements',
    color: '#4CAF50',
  },
  assertion: {
    id: 'assertion',
    name: 'Assertion',
    description: 'Verify page content and states',
    color: '#FF9800',
  },
  wait: {
    id: 'wait',
    name: 'Wait',
    description: 'Wait for elements or conditions',
    color: '#9C27B0',
  },
  data: {
    id: 'data',
    name: 'Data',
    description: 'Extract and manipulate data',
    color: '#607D8B',
  },
} as const;

// Common UI constants
export const UI_CONSTANTS = {
  DRAWER_WIDTH: 280,
  HEADER_HEIGHT: 64,
  PAGINATION_SIZE: 10,
  DEBOUNCE_DELAY: 300,
  TOAST_DURATION: 5000,
  MODAL_TRANSITION_DURATION: 225,
} as const;

// Theme colors (Citibank theme)
export const THEME_COLORS = {
  primary: '#0056C7',
  secondary: '#0070D2',
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  info: '#2196F3',
  grey: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#EEEEEE',
    300: '#E0E0E0',
    400: '#BDBDBD',
    500: '#9E9E9E',
    600: '#757575',
    700: '#616161',
    800: '#424242',
    900: '#212121',
  },
} as const;

// Error messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  FORBIDDEN: 'Access forbidden. Please contact your administrator.',
  NOT_FOUND: 'The requested resource was not found.',
  SERVER_ERROR: 'Server error. Please try again later.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  UNKNOWN_ERROR: 'An unexpected error occurred.',
} as const;
