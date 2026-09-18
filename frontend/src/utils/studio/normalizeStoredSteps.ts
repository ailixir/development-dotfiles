type StoredStep = {
  action?: string;
  target?: string;
  value?: string;
};

const toStepText = (step: StoredStep): string => {
  const target = step.target ?? '';
  const value = step.value ?? '';

  switch (step.action) {
    case 'navigate':
      return `Go to ${target}`;
    case 'type':
      return `Type ${value} in ${target}`;
    case 'click':
      return `Click ${target}`;
    case 'wait_for':
      return `Wait for ${target}`;
    case 'assert_url_contains':
      return `Check that URL contains ${value}`;
    case 'assert_visible':
      return `Check that ${target} is visible`;
    case 'assert_count':
      return `Check ${target}`;
    case 'screenshot':
      return `Take screenshot ${target}`;
    default:
      return target || value || 'Review test step';
  }
};

export const normalizeStoredSteps = (steps: unknown): string[] => {
  let parsed = steps;

  if (typeof steps === 'string') {
    try {
      parsed = JSON.parse(steps);
    } catch {
      return steps.trim() ? [steps] : [];
    }
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map((step) => (typeof step === 'string' ? step : toStepText(step as StoredStep)));
};
