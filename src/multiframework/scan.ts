import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { detectApplications, type Application, type Framework } from './detection.js';
import { analyzeChiSource } from './chi.js';
import { analyzeNextSource } from './next.js';

export interface ObservedRoute {
  framework: Framework; application: string; method: string; path: string; handler: string;
  source: { file: string; line: number };
  declarations: Array<{ expression: string; source: { file: string; line: number }; semantics: 'UNKNOWN' }>;
}
export interface AdapterResult { routes: ObservedRoute[]; warnings: string[] }
export interface FrameworkAdapter { framework: Framework; analyze(file: string, localFile: string, content: string, application: Application): AdapterResult }
const chi: FrameworkAdapter = { framework: 'go-chi', analyze(file, _local, content, application) {
  const result = analyzeChiSource(file, content);
  return { warnings: result.warnings, routes: result.routes.map(route => ({ framework: 'go-chi', application: application.root, method: route.method, path: route.path, handler: route.handler, source: { file, line: route.line }, declarations: route.middleware.map(m => ({ expression: m.expression, source: { file: m.file, line: m.line }, semantics: 'UNKNOWN' })) })) };
} };
const next: FrameworkAdapter = { framework: 'nextjs', analyze(file, local, content, application) {
  const result = analyzeNextSource(local, content);
  return { warnings: result.warnings.map(w => `${application.root}: ${w}`), routes: result.routes.map(route => ({ framework: 'nextjs', application: application.root, method: route.method, path: route.path, handler: route.handler, source: { file, line: route.line }, declarations: route.observations.map(o => ({ expression: o.expression, source: { file, line: o.line }, semantics: 'UNKNOWN' })) })) };
} };
const ignored = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', 'vendor']);
/** Experimental adapters; the existing CLI still uses the NestJS analyzer. */
export function scanFrameworkApplications(root: string): { applications: Application[]; routes: ObservedRoute[]; warnings: string[] } {
  const absolute = path.resolve(root); const applications = detectApplications(absolute);
  const routes: ObservedRoute[] = []; const warnings: string[] = [];
  for (const application of applications) {
    const adapter = [chi, next].find(a => a.framework === application.framework);
    if (!adapter) continue;
    const appRoot = path.resolve(absolute, application.root);
    function walk(directory: string): void {
      for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const target = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) { warnings.push(`Skipped symbolic link: ${path.relative(absolute, target)}`); continue; }
        if (entry.isDirectory() && !ignored.has(entry.name)) { walk(target); continue; }
        if (!entry.isFile()) continue;
        const valid = application.framework === 'go-chi' ? entry.name.endsWith('.go') && !entry.name.endsWith('_test.go') : /\.(?:ts|tsx|js|jsx)$/.test(entry.name);
        if (!valid) continue;
        const file = path.relative(absolute, target).split(path.sep).join('/');
        const local = path.relative(appRoot, target).split(path.sep).join('/');
        try { const result = adapter!.analyze(file, local, readFileSync(target, 'utf8'), application); routes.push(...result.routes); warnings.push(...result.warnings); }
        catch (error) { warnings.push(`Could not analyze ${file}: ${error instanceof Error ? error.message : String(error)}`); }
      }
    }
    walk(appRoot);
  }
  return { applications, routes, warnings: [...new Set(warnings)].sort() };
}
