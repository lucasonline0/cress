import { detectApplicationsFromFiles, readProjectFiles, type Application, type Framework, type ProjectFile } from './detection.js';
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
/** Analyze supplied source snapshots without executing application code. */
export function scanFrameworkSources(files: ProjectFile[]): { applications: Application[]; routes: ObservedRoute[]; warnings: string[] } {
  const applications = detectApplicationsFromFiles(files);
  const routes: ObservedRoute[] = []; const warnings: string[] = [];
  for (const application of applications) {
    const adapter = [chi, next].find(a => a.framework === application.framework);
    if (!adapter) continue;
    for (const source of files) {
      const prefix = application.root === '.' ? '' : `${application.root}/`;
      if (!source.file.startsWith(prefix)) continue;
      const local = source.file.slice(prefix.length);
      if (applications.some(other => other.root !== application.root && other.root !== '.' && source.file.startsWith(`${other.root}/`) && (application.root === '.' || other.root.startsWith(`${application.root}/`)))) continue;
      const valid = application.framework === 'go-chi' ? local.endsWith('.go') && !local.endsWith('_test.go') : /\.(?:ts|tsx|js|jsx)$/.test(local);
      if (!valid) continue;
      try { const result = adapter.analyze(source.file, local, source.content, application); routes.push(...result.routes); warnings.push(...result.warnings); }
      catch (error) { warnings.push(`Could not analyze ${source.file}: ${error instanceof Error ? error.message : String(error)}`); }
    }
  }
  return { applications, routes, warnings: [...new Set(warnings)].sort() };
}
export function scanFrameworkApplications(root: string): { applications: Application[]; routes: ObservedRoute[]; warnings: string[] } {
  const snapshot = readProjectFiles(root); const result = scanFrameworkSources(snapshot.files);
  return { ...result, warnings: [...new Set([...snapshot.warnings, ...result.warnings])].sort() };
}
