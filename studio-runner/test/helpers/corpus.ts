import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The package root, for tests that read files relative to it.
 *
 * This module used to load the artifact-1 reference and adversarial corpora as well; those
 * fixtures and their loaders were deleted with the artifact-1 engine (STUDIO-OBS-012A AC-3).
 */
export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
