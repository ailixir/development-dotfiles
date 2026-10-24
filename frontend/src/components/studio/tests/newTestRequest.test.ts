import { describe, expect, it } from 'vitest';
import { defaultConfiguration } from '@/types/studio/studioTypes';
import { newTestRequest } from './newTestRequest';

const FIELDS = { name: 'Login flow', csiId: 'CSI-1', description: 'Checks login', environment: 'UAT' };

describe('newTestRequest', () => {
  it('builds an empty v2 draft with the default configuration', () => {
    expect(newTestRequest(FIELDS)).toEqual({
      authoringSchemaVersion: 2,
      name: 'Login flow',
      csiId: 'CSI-1',
      description: 'Checks login',
      environment: 'UAT',
      steps: [],
      variables: [],
      configuration: defaultConfiguration(),
    });
  });

  it('trims the name and leaves the other fields as given', () => {
    const request = newTestRequest({ ...FIELDS, name: '  Login flow \n', description: ' keep  ' });
    expect(request.name).toBe('Login flow');
    expect(request.description).toBe(' keep  ');
    expect(request.csiId).toBe('CSI-1');
    expect(request.environment).toBe('UAT');
  });

  it('returns a fresh configuration, steps and variables per call', () => {
    const first = newTestRequest(FIELDS);
    const second = newTestRequest(FIELDS);
    expect(first.configuration).not.toBe(second.configuration);
    expect(first.steps).not.toBe(second.steps);
    expect(first.variables).not.toBe(second.variables);
  });
});
