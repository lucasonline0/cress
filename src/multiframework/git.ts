import { baselineFiles, resolveProjectDirectory } from '../diff.js';
import { readProjectFiles } from './detection.js';
import { scanFrameworkSources } from './scan.js';
import { compareObservedRoutes } from './compare.js';

/** Compare Git tree blobs to worktree files without checking out either revision. */
export function compareFrameworkProject(inputPath: string, base: string) {
  const root = resolveProjectDirectory(inputPath);
  const baseline = baselineFiles(root, base);
  const current = readProjectFiles(root);
  const before = scanFrameworkSources(baseline.files);
  const after = scanFrameworkSources(current.files);
  return {
    schemaVersion: 2 as const, root, base, before, after,
    changes: compareObservedRoutes(before.routes, after.routes),
    warnings: [...new Set([...current.warnings, ...before.warnings, ...after.warnings, ...baseline.skippedSymlinks.map(file => `Skipped baseline symbolic link: ${file}`), 'Route moves and changes to unsupported constructs may be ambiguous.'])].sort(),
  };
}
