import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type Framework = 'nestjs' | 'nextjs' | 'go-chi';
export interface Application { framework: Framework; root: string }
const ignored = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', 'vendor']);

/** Read manifests only; never import or execute project configuration. */
export function detectApplications(root: string): Application[] {
  const applications: Application[] = [];
  function walk(directory: string): void {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    const relative = path.relative(root, directory).split(path.sep).join('/') || '.';
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.name === 'package.json') {
        try {
          const manifest: unknown = JSON.parse(readFileSync(path.join(directory, entry.name), 'utf8'));
          if (manifest && typeof manifest === 'object') {
            const record = manifest as Record<string, unknown>;
            const dependencies = { ...(record.dependencies as object), ...(record.devDependencies as object) } as Record<string, unknown>;
            if ('@nestjs/core' in dependencies || '@nestjs/common' in dependencies) applications.push({ framework: 'nestjs', root: relative });
            if ('next' in dependencies) applications.push({ framework: 'nextjs', root: relative });
          }
        } catch { /* Invalid manifests are not evidence of a framework. */ }
      }
      if (entry.name === 'go.mod' && /(?:^|\s)github\.com\/go-chi\/chi\/v5(?:\s|$)/m.test(readFileSync(path.join(directory, entry.name), 'utf8'))) applications.push({ framework: 'go-chi', root: relative });
    }
    for (const entry of entries) if (entry.isDirectory() && !ignored.has(entry.name)) walk(path.join(directory, entry.name));
  }
  walk(path.resolve(root));
  return applications.sort((a, b) => a.root.localeCompare(b.root) || a.framework.localeCompare(b.framework));
}
