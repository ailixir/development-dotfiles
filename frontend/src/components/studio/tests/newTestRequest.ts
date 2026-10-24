import { defaultConfiguration, type TestRequest } from '@/types/studio/studioTypes';

/** The fields Create Check's UI Test form collects for a new draft. */
export interface NewTestFields {
  name: string;
  csiId: string;
  description: string;
  environment: string;
}

/**
 * The create request for a new UI test draft: no steps yet, so there is no step ID to mint. The editor
 * mints each one as the author inserts it (STUDIO-OBS-008 item a) and the first save writes them.
 */
export function newTestRequest({ name, csiId, description, environment }: NewTestFields): TestRequest {
  return {
    authoringSchemaVersion: 2,
    name: name.trim(),
    csiId,
    description,
    environment,
    steps: [],
    variables: [],
    configuration: defaultConfiguration(),
  };
}
