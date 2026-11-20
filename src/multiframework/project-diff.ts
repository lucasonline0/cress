import { baselineFiles, resolveProjectDirectory } from '../diff.js';
import { readProjectFiles } from './detection.js';
import { analyzeProjectSources, type ProjectAnalysis, type ProjectDeclaration, type ProjectRoute } from './project.js';

export interface ProjectChange {
  type: 'ROUTE_ADDED' | 'ROUTE_REMOVED' | 'DECLARATION_ADDED' | 'DECLARATION_REMOVED' | 'DECLARATION_MODIFIED' | 'UNRESOLVED_CHANGE';
  framework: string; application: string; method: string; path: string | null;
  before: { expression: string | null; source: { file: string; line: number } } | null;
  after: { expression: string | null; source: { file: string; line: number } } | null;
  review: string;
}
export interface ProjectDiff { schemaVersion: 2; root: string; base: string; changes: ProjectChange[]; warnings: string[] }
function identity(route: ProjectRoute): string { return JSON.stringify([route.framework, route.application, route.method, route.path]); }
function entry(declaration: ProjectDeclaration) { return { expression: declaration.expression, source: declaration.source }; }
function routeEntry(route: ProjectRoute) { return { expression: route.path, source: route.source }; }
function groups(routes: ProjectRoute[]): Map<string, ProjectRoute[]> {
  const grouped = new Map<string, ProjectRoute[]>();
  for (const route of routes) { const key = identity(route); grouped.set(key, [...(grouped.get(key) ?? []), route]); }
  return grouped;
}
export function compareProjectAnalyses(before: ProjectAnalysis, after: ProjectAnalysis, base: string): ProjectDiff {
  const old = groups(before.routes); const current = groups(after.routes); const changes: ProjectChange[] = [];
  for (const key of [...new Set([...old.keys(), ...current.keys()])].sort()) {
    const a = old.get(key) ?? []; const b = current.get(key) ?? []; const route = b[0] ?? a[0]; if (!route) continue;
    const make = (type: ProjectChange['type'], left: ProjectChange['before'], right: ProjectChange['after'], review: string) => changes.push({ type, framework: route.framework, application: route.application, method: route.method, path: route.path, before: left, after: right, review });
    if (a.length > 1 || b.length > 1 || route.path === null || route.method === 'UNRESOLVED') {
      make('UNRESOLVED_CHANGE', a[0] ? routeEntry(a[0]) : null, b[0] ? routeEntry(b[0]) : null, 'The route identity is ambiguous or unresolved and requires review.'); continue;
    }
    if (!a[0]) { make('ROUTE_ADDED', null, routeEntry(b[0]!), 'A route declaration appeared. Effective access remains unknown.'); continue; }
    if (!b[0]) { make('ROUTE_REMOVED', routeEntry(a[0]), null, 'A route declaration disappeared. Effective access remains unknown.'); continue; }
    const oldDeclarations = a[0].declarations; const newDeclarations = b[0].declarations;
    const keyFor = (d: ProjectDeclaration) => `${d.scope}\0${d.kind}\0${d.expression}`;
    const oldKeys = oldDeclarations.map(keyFor); const newKeys = newDeclarations.map(keyFor);
    if (JSON.stringify(oldKeys) === JSON.stringify(newKeys)) continue;
    for (const d of oldDeclarations) if (!newKeys.includes(keyFor(d))) make('DECLARATION_REMOVED', entry(d), null, 'A source declaration was removed or changed. Its runtime effect is unknown.');
    for (const d of newDeclarations) if (!oldKeys.includes(keyFor(d))) make('DECLARATION_ADDED', null, entry(d), 'A source declaration was added or changed. Its runtime effect is unknown.');
    if (oldKeys.every(key => newKeys.includes(key)) && newKeys.every(key => oldKeys.includes(key))) make('UNRESOLVED_CHANGE', routeEntry(a[0]), routeEntry(b[0]), 'Declaration order or multiplicity changed; review the source.');
  }
  return { schemaVersion: 2, root: after.root, base, changes, warnings: [...new Set([...before.warnings.map(w => `Baseline: ${w}`), ...after.warnings.map(w => `Working tree: ${w}`), 'Route moves, global declarations, and unsupported constructs require manual review.'])].sort() };
}
export function compareProject(inputPath: string, base: string): { before: ProjectAnalysis; after: ProjectAnalysis; diff: ProjectDiff } {
  const root = resolveProjectDirectory(inputPath); const baseline = baselineFiles(root, base); const current = readProjectFiles(root);
  const before = analyzeProjectSources(root, baseline.files, baseline.skippedSymlinks.map(file => `Skipped baseline symbolic link: ${file}`));
  const after = analyzeProjectSources(root, current.files, current.warnings);
  return { before, after, diff: compareProjectAnalyses(before, after, base) };
}
