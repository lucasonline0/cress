import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { analyzePath, analyzeSourceTexts, isAnalyzableSourcePath } from './analyzer.js';
import type { AnalysisResult, AuthorizationChange, AuthorizationDeclaration, DiffResult, RouteFinding, SourceLocation } from './types.js';

interface TreeFile { objectId: string; file: string }
function git(cwd: string, args: string[], input?: string): Buffer {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'buffer', input, maxBuffer: 128 * 1024 * 1024, windowsHide: true });
  if (result.error) throw new Error(`Could not run Git: ${result.error.message}`);
  if (result.status !== 0) throw new Error(result.stderr.toString('utf8').trim() || `Git command failed: git ${args[0] ?? ''}`);
  return result.stdout;
}
function parseNulList(buffer: Buffer): string[] {
  return buffer.toString('utf8').split('\0').filter(Boolean);
}
function resolveProjectDirectory(inputPath: string): string {
  const absolute = path.resolve(inputPath);
  let details;
  try { details = statSync(absolute); } catch { throw new Error(`Path does not exist or cannot be read: ${inputPath}`); }
  if (!details.isDirectory()) throw new Error(`Expected a directory path: ${inputPath}`);
  return absolute;
}
function baselineFiles(projectPath: string, base: string): { root: string; files: Array<{ file: string; content: string }> } {
  let topLevel: string;
  try { topLevel = git(projectPath, ['rev-parse', '--show-toplevel']).toString('utf8').trim(); }
  catch { throw new Error(`Path is not inside a Git working tree: ${projectPath}`); }
  const repoRoot = path.resolve(topLevel);
  const projectRelative = path.relative(repoRoot, projectPath).split(path.sep).join('/') || '.';
  if (projectRelative === '..' || projectRelative.startsWith('../') || path.isAbsolute(projectRelative)) throw new Error('The requested path is outside the Git repository.');
  let resolvedBase: string;
  try { resolvedBase = git(repoRoot, ['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]).toString('utf8').trim(); }
  catch { throw new Error(`Git reference does not resolve to a commit: ${base}`); }
  if (!resolvedBase) throw new Error(`Git reference does not resolve to a commit: ${base}`);
  const records = parseNulList(git(repoRoot, ['ls-tree', '-rz', '--full-tree', resolvedBase, '--', projectRelative]));
  const treeFiles: TreeFile[] = [];
  for (const record of records) {
    const tab = record.indexOf('\t');
    if (tab < 0) continue;
    const [mode, type, objectId] = record.slice(0, tab).split(' ');
    const file = record.slice(tab + 1);
    if (type !== 'blob' || !mode || !objectId || !isAnalyzableSourcePath(file)) continue;
    if (projectRelative !== '.' && !file.startsWith(`${projectRelative}/`)) continue;
    treeFiles.push({ objectId, file });
  }
  const files = treeFiles.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0).map(({ objectId, file }) => ({
    file: projectRelative === '.' ? file : file.slice(projectRelative.length + 1),
    content: git(repoRoot, ['cat-file', 'blob', objectId]).toString('utf8'),
  }));
  return { root: projectPath, files };
}
function relevantUntrackedFiles(projectPath: string): string[] {
  const repoRoot = path.resolve(git(projectPath, ['rev-parse', '--show-toplevel']).toString('utf8').trim());
  const projectRelative = path.relative(repoRoot, projectPath).split(path.sep).join('/') || '.';
  return parseNulList(git(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z', '--', projectRelative]))
    .filter((file) => isAnalyzableSourcePath(file) && (projectRelative === '.' || file.startsWith(`${projectRelative}/`)));
}
function routeId(route: RouteFinding): string { return `${route.method} ${route.controller}#${route.handler}`; }
function routeSummary(route: RouteFinding): NonNullable<AuthorizationChange['route']> {
  return { method: route.method, path: route.routePath, controller: route.controller, handler: route.handler };
}
function routeSource(route: RouteFinding): { expression: string | null; source: SourceLocation } {
  const expression = route.routePath ?? `@Controller(${route.controllerPathExpression}) + @route(${route.handlerPathExpression})`;
  return { expression, source: route.source };
}
function pathDeclarationSource(route: RouteFinding, controller: boolean): { expression: string; source: SourceLocation } {
  return controller
    ? { expression: `@Controller(${route.controllerPathExpression})`, source: route.controllerPathSource }
    : { expression: `@route(${route.handlerPathExpression})`, source: route.handlerPathSource };
}
function declarationEntry(declaration: AuthorizationDeclaration): { expression: string | null; source: SourceLocation } {
  return { expression: declaration.expression, source: declaration.source };
}
function makeChange(type: AuthorizationChange['type'], id: string, route: RouteFinding | null, declarationKind: string | null, before: AuthorizationChange['before'], after: AuthorizationChange['after'], review: string): AuthorizationChange {
  return { type, routeId: id, route: route ? routeSummary(route) : null, declarationKind, before, after, review };
}
function appendDeclarationChanges(changes: AuthorizationChange[], id: string, route: RouteFinding | null, beforeItems: AuthorizationDeclaration[], afterItems: AuthorizationDeclaration[]): void {
  const keys = [...new Set([...beforeItems, ...afterItems].map((item) => `${item.scope}\0${item.kind}`))].sort();
  for (const key of keys) {
    const [scope, kind] = key.split('\0') as [string, string];
    const oldGroup = beforeItems.filter((item) => item.scope === scope && item.kind === kind);
    const newGroup = afterItems.filter((item) => item.scope === scope && item.kind === kind);
    if (oldGroup.length > 1 || newGroup.length > 1) {
      if (JSON.stringify(oldGroup.map((item) => item.expression)) !== JSON.stringify(newGroup.map((item) => item.expression))) {
        changes.push(makeChange('UNRESOLVED_CHANGE', id, route, `${scope}:${kind}`, oldGroup[0] ? declarationEntry(oldGroup[0]) : null, newGroup[0] ? declarationEntry(newGroup[0]) : null, `Multiple ${kind} declarations in ${scope} scope make this change ambiguous.`));
      }
      continue;
    }
    const oldItem = oldGroup[0]; const newItem = newGroup[0];
    if (oldItem?.expression === newItem?.expression) continue;
    const unresolved = (oldItem && oldItem.semantics === 'UNKNOWN') || (newItem && newItem.semantics === 'UNKNOWN');
    const type = unresolved ? 'UNRESOLVED_CHANGE' : !oldItem ? 'DECLARATION_ADDED' : !newItem ? 'DECLARATION_REMOVED' : 'DECLARATION_MODIFIED';
    const changeDescription = !oldItem ? `A ${kind} declaration was added in ${scope} scope.` : !newItem ? `A ${kind} declaration was removed from ${scope} scope.` : `A ${kind} declaration changed in ${scope} scope.`;
    changes.push(makeChange(type, id, route, `${scope}:${kind}`, oldItem ? declarationEntry(oldItem) : null, newItem ? declarationEntry(newItem) : null, unresolved ? `${changeDescription} Its authorization semantics are unknown.` : `${changeDescription} This describes source declarations only; effective access is unknown.`));
  }
}
function routeGroups(analysis: AnalysisResult): Map<string, RouteFinding[]> {
  const groups = new Map<string, RouteFinding[]>();
  for (const route of analysis.findings) groups.set(routeId(route), [...(groups.get(routeId(route)) ?? []), route]);
  return groups;
}
function compareAnalyses(before: AnalysisResult, after: AnalysisResult, base: string, root: string, extraWarnings: string[] = []): DiffResult {
  const changes: AuthorizationChange[] = [];
  const oldGroups = routeGroups(before); const newGroups = routeGroups(after);
  for (const id of [...new Set([...oldGroups.keys(), ...newGroups.keys()])].sort()) {
    const oldRoutes = oldGroups.get(id) ?? []; const newRoutes = newGroups.get(id) ?? [];
    if (oldRoutes.length > 1 || newRoutes.length > 1) {
      changes.push(makeChange('UNRESOLVED_CHANGE', id, newRoutes[0] ?? oldRoutes[0] ?? null, null, oldRoutes[0] ? routeSource(oldRoutes[0]) : null, newRoutes[0] ? routeSource(newRoutes[0]) : null, 'More than one route shares this method/controller/handler identity; comparison is ambiguous.'));
      continue;
    }
    const oldRoute = oldRoutes[0]; const newRoute = newRoutes[0];
    if (!oldRoute && newRoute) {
      const type = newRoute.routePath === null ? 'UNRESOLVED_CHANGE' : 'ROUTE_ADDED';
      changes.push(makeChange(type, id, newRoute, null, null, routeSource(newRoute), type === 'ROUTE_ADDED' ? 'A route declaration was added. This does not establish its effective access.' : 'A route with an unresolved path appeared; route identity cannot be fully established.'));
      continue;
    }
    if (oldRoute && !newRoute) {
      const type = oldRoute.routePath === null ? 'UNRESOLVED_CHANGE' : 'ROUTE_REMOVED';
      changes.push(makeChange(type, id, oldRoute, null, routeSource(oldRoute), null, type === 'ROUTE_REMOVED' ? 'A route declaration was removed from the working tree.' : 'A route with an unresolved path disappeared; route identity cannot be fully established.'));
      continue;
    }
    if (!oldRoute || !newRoute) continue;
    if (oldRoute.routePath !== newRoute.routePath || oldRoute.controllerPathExpression !== newRoute.controllerPathExpression || oldRoute.handlerPathExpression !== newRoute.handlerPathExpression) {
      const unresolved = oldRoute.routePath === null || newRoute.routePath === null;
      const controllerPathChanged = oldRoute.controllerPathExpression !== newRoute.controllerPathExpression;
      const beforePath = pathDeclarationSource(oldRoute, controllerPathChanged);
      const afterPath = pathDeclarationSource(newRoute, controllerPathChanged);
      changes.push(makeChange(unresolved ? 'UNRESOLVED_CHANGE' : 'ROUTE_MODIFIED', id, newRoute, null, beforePath, afterPath, unresolved ? 'The route path is unresolved on at least one side.' : 'The declared route path changed; effective access is unknown.'));
    }
    appendDeclarationChanges(changes, id, newRoute, oldRoute.authorizationDeclarations, newRoute.authorizationDeclarations);
  }
  appendDeclarationChanges(changes, '[global]', null, before.globalDeclarations, after.globalDeclarations);
  changes.sort((a, b) => a.routeId < b.routeId ? -1 : a.routeId > b.routeId ? 1 : a.type < b.type ? -1 : a.type > b.type ? 1 : 0);
  const warnings = [
    ...before.warnings.map((warning) => `Baseline: ${warning}`),
    ...after.warnings.map((warning) => `Working tree: ${warning}`),
    ...extraWarnings,
    'Route matching uses HTTP method, controller class, and handler name; renames or duplicate identities can be ambiguous.',
    'Generated and dependency directories are excluded from analysis.',
  ];
  return { schemaVersion: 1, base, root, changes, warnings: [...new Set(warnings)].sort() };
}

export function comparePath(inputPath: string, base: string): DiffResult {
  const projectPath = resolveProjectDirectory(inputPath);
  const baseline = baselineFiles(projectPath, base);
  const current = analyzePath(projectPath);
  const untracked = relevantUntrackedFiles(projectPath);
  const warnings = untracked.length ? [`Working tree contains ${untracked.length} untracked TypeScript source file(s); they are included only on the working-tree side.`] : [];
  return compareAnalyses(analyzeSourceTexts(baseline.root, baseline.files), current, base, projectPath, warnings);
}

export function loadReportInputs(inputPath: string, base: string): { before: AnalysisResult; after: AnalysisResult; diff: DiffResult } {
  const projectPath = resolveProjectDirectory(inputPath);
  const baseline = baselineFiles(projectPath, base);
  const after = analyzePath(projectPath);
  const untracked = relevantUntrackedFiles(projectPath);
  const warnings = untracked.length ? [`Working tree contains ${untracked.length} untracked TypeScript source file(s); they are included only on the working-tree side.`] : [];
  const before = analyzeSourceTexts(baseline.root, baseline.files);
  return { before, after, diff: compareAnalyses(before, after, base, projectPath, warnings) };
}
