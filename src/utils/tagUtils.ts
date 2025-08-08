/**
 * Tag utility functions for handling prefixed tags
 * Tags follow the format: prefix:value (e.g., application:trading-api, team:platform-engineering)
 */

export interface TagCategory {
  prefix: string;
  label: string;
  description: string;
  color: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info' | 'default';
  icon?: string;
}

// Define tag categories with their prefixes
export const TAG_CATEGORIES: TagCategory[] = [
  {
    prefix: 'application',
    label: 'Application',
    description: 'The application or system this check monitors',
    color: 'primary',
    icon: 'Apps'
  },
  {
    prefix: 'team',
    label: 'Team',
    description: 'The team responsible for this check',
    color: 'secondary',
    icon: 'Group'
  },
  {
    prefix: 'lob',
    label: 'Line of Business',
    description: 'The business line this check supports',
    color: 'success',
    icon: 'Business'
  },
  {
    prefix: 'priority',
    label: 'Priority',
    description: 'The priority level of this check',
    color: 'error',
    icon: 'PriorityHigh'
  },
  {
    prefix: 'type',
    label: 'Type',
    description: 'The type of check or monitoring',
    color: 'info',
    icon: 'Category'
  },
  {
    prefix: 'component',
    label: 'Component',
    description: 'The specific component being monitored',
    color: 'warning',
    icon: 'Extension'
  },
  {
    prefix: 'platform',
    label: 'Platform',
    description: 'The platform or technology stack',
    color: 'default',
    icon: 'Devices'
  },
  {
    prefix: 'customer',
    label: 'Customer',
    description: 'Customer-facing impact',
    color: 'primary',
    icon: 'Person'
  },
  {
    prefix: 'compliance',
    label: 'Compliance',
    description: 'Regulatory or compliance requirements',
    color: 'error',
    icon: 'Gavel'
  },
  {
    prefix: 'audit',
    label: 'Audit',
    description: 'Audit requirements',
    color: 'warning',
    icon: 'AssignmentTurnedIn'
  },
  {
    prefix: 'exchange',
    label: 'Exchange',
    description: 'Trading exchange or market',
    color: 'info',
    icon: 'TrendingUp'
  },
  {
    prefix: 'test-type',
    label: 'Test Type',
    description: 'Type of test execution',
    color: 'secondary',
    icon: 'Science'
  }
];

// Common tag values for each category
export const COMMON_TAG_VALUES = {
  application: [
    'trading-api',
    'trading-platform',
    'payment-gateway',
    'core-banking',
    'online-banking',
    'mobile-banking',
    'risk-management',
    'compliance-audit',
    'security-ops',
    'automation-platform',
    'infrastructure-services',
    'bi-platform',
    'customer-portal',
    'settlement-engine',
    'market-data-api'
  ],
  team: [
    'platform-engineering',
    'database-ops',
    'sre',
    'payments-team',
    'core-systems',
    'customer-experience',
    'qa-automation',
    'devops',
    'infrastructure',
    'cybersecurity',
    'risk-analytics',
    'compliance-ops',
    'monitoring-ops',
    'performance-eng',
    'mobile-dev'
  ],
  lob: [
    'capital-markets',
    'retail-banking',
    'enterprise-banking',
    'transaction-services',
    'risk-compliance',
    'digital-channels',
    'technology-infrastructure',
    'enterprise-security',
    'enterprise-data'
  ],
  priority: [
    'critical',
    'high',
    'medium',
    'low',
    'business-critical',
    'customer-facing',
    'regulatory'
  ],
  type: [
    'api',
    'ui-test',
    'performance',
    'infrastructure',
    'monitoring',
    'analytics',
    'siem',
    'tcp-check',
    'splunk-query',
    'grafana-metrics',
    'itrs-monitor',
    'appdynamics',
    'api-check',
    'log-analysis',
    'apm'
  ],
  component: [
    'database',
    'cache',
    'gateway',
    'db-pool',
    'network',
    'storage',
    'market-data',
    'incident-response',
    'reporting'
  ],
  platform: [
    'ios',
    'android',
    'web',
    'mobile'
  ],
  customer: [
    'internal',
    'external'
  ],
  compliance: [
    'sox',
    'regulatory',
    'pci-dss',
    'gdpr'
  ],
  audit: [
    'required',
    'optional',
    'quarterly',
    'annual'
  ],
  exchange: [
    'nyse',
    'nasdaq',
    'lse',
    'tsx',
    'cboe'
  ],
  'test-type': [
    'unit',
    'integration',
    'e2e',
    'smoke',
    'regression'
  ]
};

/**
 * Parse a prefixed tag into its components
 * @param tag The full tag string (e.g., "application:trading-api")
 * @returns Object with prefix and value, or null if not a prefixed tag
 */
export function parseTag(tag: string): { prefix: string; value: string } | null {
  const parts = tag.split(':');
  if (parts.length !== 2) {
    return null;
  }
  return {
    prefix: parts[0].toLowerCase(),
    value: parts[1]
  };
}

/**
 * Get the category configuration for a tag prefix
 * @param prefix The tag prefix to look up
 * @returns The category configuration or undefined
 */
export function getTagCategory(prefix: string): TagCategory | undefined {
  return TAG_CATEGORIES.find(cat => cat.prefix === prefix.toLowerCase());
}

/**
 * Format a tag for display
 * @param tag The full tag string
 * @returns Formatted display string
 */
export function formatTagDisplay(tag: string): string {
  const parsed = parseTag(tag);
  if (!parsed) {
    return tag;
  }
  
  const category = getTagCategory(parsed.prefix);
  if (!category) {
    return tag;
  }
  
  // Convert value from kebab-case to Title Case
  const formattedValue = parsed.value
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  return formattedValue;
}

/**
 * Get the color for a tag based on its prefix
 * @param tag The full tag string
 * @returns MUI color variant
 */
export function getTagColor(tag: string): TagCategory['color'] {
  const parsed = parseTag(tag);
  if (!parsed) {
    return 'default';
  }
  
  const category = getTagCategory(parsed.prefix);
  return category?.color || 'default';
}

/**
 * Group tags by their prefix
 * @param tags Array of tag strings
 * @returns Object with tags grouped by prefix
 */
export function groupTagsByPrefix(tags: string[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  
  tags.forEach(tag => {
    const parsed = parseTag(tag);
    if (parsed) {
      if (!grouped[parsed.prefix]) {
        grouped[parsed.prefix] = [];
      }
      grouped[parsed.prefix].push(parsed.value);
    } else {
      // Handle unprefixed tags
      if (!grouped['other']) {
        grouped['other'] = [];
      }
      grouped['other'].push(tag);
    }
  });
  
  return grouped;
}

/**
 * Filter tags by prefix
 * @param tags Array of tag strings
 * @param prefix The prefix to filter by
 * @returns Array of tags with the specified prefix
 */
export function filterTagsByPrefix(tags: string[], prefix: string): string[] {
  return tags.filter(tag => {
    const parsed = parseTag(tag);
    return parsed && parsed.prefix === prefix.toLowerCase();
  });
}

/**
 * Generate tag suggestions based on prefix
 * @param prefix The tag prefix
 * @returns Array of suggested complete tags
 */
export function getTagSuggestions(prefix: string): string[] {
  const values = COMMON_TAG_VALUES[prefix as keyof typeof COMMON_TAG_VALUES];
  if (!values) {
    return [];
  }
  
  return values.map(value => `${prefix}:${value}`);
}

/**
 * Validate if a tag follows the correct format
 * @param tag The tag to validate
 * @returns Boolean indicating if the tag is valid
 */
export function isValidTag(tag: string): boolean {
  const parsed = parseTag(tag);
  if (!parsed) {
    return false;
  }
  
  // Check if the prefix is recognized
  const category = getTagCategory(parsed.prefix);
  if (!category) {
    return false;
  }
  
  // Value should not be empty and should follow kebab-case convention
  const valueRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  return valueRegex.test(parsed.value);
}

/**
 * Create a new prefixed tag
 * @param prefix The tag prefix
 * @param value The tag value
 * @returns The formatted tag string
 */
export function createTag(prefix: string, value: string): string {
  // Convert value to kebab-case if needed
  const kebabValue = value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  
  return `${prefix.toLowerCase()}:${kebabValue}`;
}

/**
 * Sort tags by category priority
 * @param tags Array of tag strings
 * @returns Sorted array of tags
 */
export function sortTagsByCategory(tags: string[]): string[] {
  const categoryOrder = TAG_CATEGORIES.map(cat => cat.prefix);
  
  return tags.sort((a, b) => {
    const parsedA = parseTag(a);
    const parsedB = parseTag(b);
    
    if (!parsedA && !parsedB) return 0;
    if (!parsedA) return 1;
    if (!parsedB) return -1;
    
    const indexA = categoryOrder.indexOf(parsedA.prefix);
    const indexB = categoryOrder.indexOf(parsedB.prefix);
    
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    
    return indexA - indexB;
  });
}