import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type Framework = 'nestjs' | 'nextjs' | 'go-chi';
export interface Application { framework: Framework; root: string }
export interface ProjectFile { file: string; content: string }
export const ignoredDirectories = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', 'vendor']);
export function isProjectFile(file: string): boolean {
  const parts = file.replaceAll('\\', '/').split('/');
  if (parts.some(part => ignoredDirectories.has(part) || part === '..' || part === '')) return false;
  const name = parts.at(-1) ?? '';
  return name === 'package.json' || name === 'go.mod' || (/\.(?:ts|tsx|js|jsx|go)$/.test(name) && !name.endsWith('.d.ts'));
}
/** Inspect in-memory manifest contents from either a worktree or Git snapshot. */
export function detectApplicationsFromFiles(files: ProjectFile[]): Application[] {
  const applications: Application[] = [];
  for (const {file, content} of files) {
    if (!isProjectFile(file)) continue;
    const name = path.posix.basename(file);
    const root = path.posix.dirname(file);
    if (name === 'package.json') {
      try {
        const manifest: unknown = JSON.parse(content);
        if (manifest && typeof manifest === 'object') {
          const record = manifest as Record<string, unknown>;
          const dependencies = { ...(record.dependencies as object), ...(record.devDependencies as object) } as Record<string, unknown>;
          if ('@nestjs/core' in dependencies || '@nestjs/common' in dependencies) applications.push({ framework: 'nestjs', root });
          if ('next' in dependencies) applications.push({ framework: 'nextjs', root });
        }
      } catch { /* Invalid manifests are not evidence of a framework. */ }
    }
    if (name === 'go.mod' && /(?:^|\s)github\.com\/go-chi\/chi\/v5(?:\s|$)/m.test(content)) applications.push({ framework: 'go-chi', root });
  }
  return applications.sort((a, b) => a.root.localeCompare(b.root) || a.framework.localeCompare(b.framework));
}
export function readProjectFiles(root: string): { files: ProjectFile[]; warnings: string[] } {
  const absolute = path.resolve(root); const files: ProjectFile[] = []; const warnings: string[] = [];
  function walk(directory: string): void {
    let entries;
    try { entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); }
    catch { warnings.push(`Could not read directory: ${path.relative(absolute, directory) || '.'}`); return; }
    for (const entry of entries) {
      const target = path.join(directory, entry.name); const relative = path.relative(absolute, target).split(path.sep).join('/');
      if (entry.isSymbolicLink()) { if (!ignoredDirectories.has(entry.name)) warnings.push(`Skipped symbolic link: ${relative}`); }
      else if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) walk(target);
      else if (entry.isFile() && isProjectFile(relative)) {
        try { files.push({ file: relative, content: readFileSync(target, 'utf8') }); }
        catch { warnings.push(`Could not read file: ${relative}`); }
      }
    }
  }
  walk(absolute);
  return { files, warnings: warnings.sort() };
}
/** Read manifests only; never import or execute project configuration. */
export function detectApplications(root: string): Application[] {
  return detectApplicationsFromFiles(readProjectFiles(root).files);
}
