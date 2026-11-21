import path from 'node:path';
import { statSync } from 'node:fs';
import { analyzeSourceTexts } from '../analyzer.js';
import type { AnalysisStatus, AuthorizationDeclaration, RouteFinding, SourceLocation } from '../types.js';
import { readProjectFiles, type Application, type Framework, type ProjectFile } from './detection.js';
import { scanFrameworkSources } from './scan.js';

export interface ProjectDeclaration {
  kind: string; scope: string; expression: string | null; source: SourceLocation; semantics: 'OBSERVED' | 'UNKNOWN';
}
export interface ProjectRoute {
  framework: Framework; application: string; method: string; path: string | null; handler: string;
  source: SourceLocation; declarations: ProjectDeclaration[]; status: AnalysisStatus; warnings: string[];
  /** Original NestJS fields, present only for NestJS routes. */
  nestjs?: RouteFinding;
}
export interface ProjectAnalysis {
  schemaVersion: 2; root: string; applications: Application[]; routes: ProjectRoute[];
  globalDeclarations: Array<{ application: string; framework: Framework; declaration: ProjectDeclaration }>;
  scannedFiles: number; warnings: string[];
}
function belongs(file: string, root: string): boolean { return root === '.' || file.startsWith(`${root}/`); }
function rebase(source: SourceLocation, root: string): SourceLocation {
  return { file: root === '.' ? source.file : `${root}/${source.file}`, line: source.line };
}
function rebaseDeclaration(declaration: AuthorizationDeclaration, root: string): ProjectDeclaration {
  return { ...declaration, source: rebase(declaration.source, root) };
}
/** Analyze a snapshot using the same adapters for a working tree and a baseline. */
export function analyzeProjectSources(root: string, files: ProjectFile[], inputWarnings: string[] = []): ProjectAnalysis {
  const absolute = path.resolve(root); const other = scanFrameworkSources(files);
  const applications = [...other.applications];
  const routes: ProjectRoute[] = other.routes.map(route => ({
    framework: route.framework, application: route.application, method: route.method, path: route.path, handler: route.handler,
    source: route.source, declarations: route.declarations.map(declaration => ({ kind: route.framework === 'go-chi' ? 'middleware' : 'helper call', scope: 'unknown', ...declaration })),
    status: route.method === 'UNRESOLVED' || route.path === null ? 'UNRESOLVED' : 'REQUIRES_REVIEW', warnings: ['Observed declarations do not establish effective authorization.'],
  }));
  const globalDeclarations: ProjectAnalysis['globalDeclarations'] = other.globalObservations.map(o => ({ application: o.application, framework: 'nextjs', declaration: { kind: 'middleware observation', scope: 'global', expression: o.expression, source: { file: o.file, line: o.line }, semantics: 'UNKNOWN' } }));
  const warnings = [...inputWarnings, ...other.warnings];
  if (applications.some(a => a.framework === 'nextjs')) warnings.push('Next.js middleware matchers, indirect exports, and runtime authorization are not fully analyzed.');
  if (applications.some(a => a.framework === 'go-chi')) warnings.push('Chi mounts, indirect router construction, cross-package registrations, build constraints, and runtime authorization may be unresolved.');
  const nestApps = applications.filter(app => app.framework === 'nestjs');
  // Existing users can scan controller directories without a package manifest.
  if (!nestApps.length) nestApps.push({ framework: 'nestjs', root: '.' });
  for (const app of nestApps) {
    const selected = files.filter(file => belongs(file.file, app.root) && !applications.some(otherApp => otherApp.root !== app.root && belongs(otherApp.root, app.root) && belongs(file.file, otherApp.root)));
    const prefix = app.root === '.' ? '' : `${app.root}/`;
    const result = analyzeSourceTexts(path.resolve(absolute, app.root), selected.map(file => ({ ...file, file: file.file.slice(prefix.length) })));
    if (!applications.some(a => a.framework === 'nestjs' && a.root === app.root) && result.findings.length) applications.push(app);
    warnings.push(...result.warnings.map(w => `${app.root}: ${w}`));
    globalDeclarations.push(...result.globalDeclarations.map(declaration => ({ application: app.root, framework: 'nestjs' as const, declaration: rebaseDeclaration(declaration, app.root) })));
    for (const route of result.findings) routes.push({
      framework: 'nestjs', application: app.root, method: route.method, path: route.routePath,
      handler: `${route.controller}#${route.handler}`, source: rebase(route.source, app.root),
      declarations: route.authorizationDeclarations.map(declaration => rebaseDeclaration(declaration, app.root)),
      status: route.status, warnings: route.warnings, nestjs: { ...route, source: rebase(route.source, app.root), controllerPathSource: rebase(route.controllerPathSource, app.root), handlerPathSource: rebase(route.handlerPathSource, app.root), authorizationDeclarations: route.authorizationDeclarations.map(d => ({ ...d, source: rebase(d.source, app.root) })) },
    });
  }
  if (!applications.length) warnings.push('No supported API framework was detected.');
  else if (!routes.length) warnings.push('Supported framework detected; no routes were recognized.');
  warnings.push('Static observations do not establish effective authorization.');
  routes.sort((a, b) => `${a.application}\0${a.framework}\0${a.method}\0${a.path}\0${a.source.file}\0${a.source.line}`.localeCompare(`${b.application}\0${b.framework}\0${b.method}\0${b.path}\0${b.source.file}\0${b.source.line}`));
  applications.sort((a, b) => a.root.localeCompare(b.root) || a.framework.localeCompare(b.framework));
  return { schemaVersion: 2, root: absolute, applications, routes, globalDeclarations, scannedFiles: files.length, warnings: [...new Set(warnings)].sort() };
}
export function analyzeProject(inputPath: string): ProjectAnalysis {
  const root = path.resolve(inputPath);
  let stat;
  try { stat = statSync(root); } catch { throw new Error(`Path does not exist or cannot be read: ${inputPath}`); }
  if (!stat.isDirectory()) throw new Error(`Expected a directory path: ${inputPath}`);
  const snapshot = readProjectFiles(root);
  return analyzeProjectSources(root, snapshot.files, snapshot.warnings);
}
