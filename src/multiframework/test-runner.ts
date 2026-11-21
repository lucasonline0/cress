import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type { TestRunner } from './experience.js';

/** Inspect manifests and known config filenames only; never execute project code. */
export function detectTestRunners(root: string, application: string): TestRunner[] {
  const base = realpathSync(root);
  const app = path.resolve(base, application);
  const resolved = realpathSync(app);
  const relative = path.relative(base, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !statSync(resolved).isDirectory()) throw new Error('Invalid application path.');
  const found = new Set<TestRunner>();
  for (const dir of new Set([resolved, base])) {
    const manifest = path.join(dir, 'package.json');
    if (existsSync(manifest) && !path.relative(base, realpathSync(manifest)).startsWith('..') && statSync(manifest).size < 1024 * 1024) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as Record<string, unknown>;
      const deps = { ...(pkg.dependencies as object), ...(pkg.devDependencies as object) } as Record<string, unknown>;
      if (deps.jest || pkg.jest) found.add('jest'); if (deps.vitest) found.add('vitest');
    }
    for (const runner of ['jest', 'vitest'] as const) if (['js', 'cjs', 'mjs', 'ts', 'mts', 'cts', 'json'].some(ext => existsSync(path.join(dir, `${runner}.config.${ext}`)))) found.add(runner);
  }
  return [...found];
}
