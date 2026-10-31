// External @put/core-components declaration for the freeze (environment.ts externalCoreDeclaration): the package the app loads from
// frontend/node_modules, package.json and dist only. Nonsecret; written by gen-config.mjs next to the other overlays.
import fs from 'node:fs';
import path from 'node:path';

export function coreDeclaration(repoRoot) {
  const root = path.join(repoRoot, 'frontend', 'node_modules', '@put', 'core-components');
  if (!fs.existsSync(path.join(root, 'package.json')) || !fs.statSync(path.join(root, 'dist'), { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`core-declaration: ${root} needs package.json and dist (run pnpm install in frontend/)`);
  }
  return { root, sourceScopes: ['package.json'], artifactRoot: root, artifactScopes: ['dist'] };
}
