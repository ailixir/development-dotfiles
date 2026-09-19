import type { AuthoringV2Request, LegacyAuthoringRequest } from '@/types/studio/studioTypes';

export const legacyDraft: LegacyAuthoringRequest = {
  steps: ['  Open Café ☕  ', 'Type "A\\B"\nnext line'],
};

export const contextDraft: AuthoringV2Request = {
  authoringSchemaVersion: 2,
  globalContext: { entries: [{ kind: 'text', value: 'Authenticated application' }] },
  steps: [
    {
      id: '00000000-0000-4000-8000-000000000101',
      text: 'Login',
      context: {
        entries: [{ kind: 'literal', value: '  Café 東京 "quoted"\n  ' }],
      },
    },
    {
      id: '00000000-0000-4000-8000-000000000102',
      text: 'Open reports',
    },
  ],
};
