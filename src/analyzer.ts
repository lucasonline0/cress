import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { Project, SyntaxKind, type ClassDeclaration, type Decorator, type MethodDeclaration, type SourceFile } from 'ts-morph';
import type { AnalysisResult, AuthorizationDeclaration, RouteFinding, SourceLocation } from './types.js';

const ignored = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.next']);
const routeMethods: Record<string, string> = { Get: 'GET', Post: 'POST', Put: 'PUT', Patch: 'PATCH', Delete: 'DELETE', Options: 'OPTIONS', Head: 'HEAD' };
const accessDecorators = new Set(['UseGuards', 'Roles', 'Public', 'SetMetadata']);

function collectFiles(directory: string, root: string, skippedSymlinks: string[]): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      if (!ignored.has(entry.name)) skippedSymlinks.push(path.relative(root, fullPath).split(path.sep).join('/'));
    } else if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) found.push(...collectFiles(fullPath, root, skippedSymlinks));
    } else if (entry.isFile() && isAnalyzableSourcePath(entry.name)) found.push(fullPath);
  }
  return found.sort((a, b) => a.localeCompare(b));
}
export function isAnalyzableSourcePath(file: string): boolean {
  const normalized = file.split(/[\\/]/).filter(Boolean);
  return /\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts') && !normalized.some((part) => ignored.has(part));
}
function decorators(node: ClassDeclaration | MethodDeclaration, name: string): Decorator[] {
  return node.getDecorators().filter((decorator) => decorator.getName() === name);
}
function literalArg(decorator: Decorator): string | null {
  const expression = decorator.getArguments()[0];
  if (!expression) return '';
  if (expression.getKind() === SyntaxKind.StringLiteral) return expression.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
  if (expression.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) return expression.asKindOrThrow(SyntaxKind.NoSubstitutionTemplateLiteral).getLiteralValue();
  return null;
}
function literalString(expression: import('ts-morph').Node): string | null {
  if (expression.getKind() === SyntaxKind.StringLiteral) return expression.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
  if (expression.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) return expression.asKindOrThrow(SyntaxKind.NoSubstitutionTemplateLiteral).getLiteralValue();
  return null;
}
function pathExpression(decorator: Decorator): string {
  return decorator.getArguments()[0]?.getText() ?? '';
}
function literalArguments(decorator: Decorator): { values: string[]; unresolved: boolean } {
  const values: string[] = [];
  let unresolved = false;
  for (const argument of decorator.getArguments()) {
    const value = literalString(argument);
    if (value === null) unresolved = true;
    else values.push(value);
  }
  return { values, unresolved };
}
function metadata(node: ClassDeclaration | MethodDeclaration): { guards: string[]; roles: string[]; isPublic: boolean; unresolved: boolean } {
  const guards: string[] = []; const roles: string[] = []; let isPublic = false; let unresolved = false;
  for (const decorator of node.getDecorators()) {
    const name = decorator.getName();
    if (!accessDecorators.has(name)) continue;
    const args = literalArguments(decorator);
    if (name === 'UseGuards') {
      for (const argument of decorator.getArguments()) guards.push(argument.getText());
      if (decorator.getArguments().length === 0) unresolved = true;
    } else if (name === 'Roles') {
      if (args.unresolved) unresolved = true;
      roles.push(...args.values);
      if (args.values.length === 0 && args.unresolved === false) unresolved = true;
    } else if (name === 'Public') {
      isPublic = true;
      if (decorator.getArguments().length > 0) unresolved = true;
    } else {
      unresolved = true;
    }
  }
  return { guards, roles, isPublic, unresolved };
}
function joinPaths(controller: string | null, handler: string | null): string | null {
  if (controller === null || handler === null) return null;
  const parts = `${controller}/${handler}`.split('/').filter(Boolean);
  return `/${parts.join('/')}`;
}
function sourceLocation(source: SourceFile, root: string, line: number): SourceLocation {
  return { file: path.relative(root, source.getFilePath()).split(path.sep).join('/'), line };
}
function declarations(node: ClassDeclaration | MethodDeclaration, scope: 'controller' | 'handler', source: SourceFile, root: string): AuthorizationDeclaration[] {
  return node.getDecorators().filter((decorator) => decorator.getName() !== 'Controller' && !Object.hasOwn(routeMethods, decorator.getName())).map((decorator) => {
    const kind = decorator.getName();
    const recognized = accessDecorators.has(kind);
    const roleValues = kind === 'Roles' ? literalArguments(decorator) : null;
    const knownLiteralRole = !roleValues || (!roleValues.unresolved && roleValues.values.length > 0);
    return {
      scope, kind, expression: decorator.getText(), source: sourceLocation(source, root, decorator.getStartLineNumber()),
      semantics: recognized && kind !== 'Public' && kind !== 'SetMetadata' && knownLiteralRole ? 'OBSERVED' : 'UNKNOWN',
    };
  });
}
function findGlobalDeclarations(source: SourceFile, root: string): AuthorizationDeclaration[] {
  const result: AuthorizationDeclaration[] = [];
  for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expression = call.getExpression();
    const callName = expression.getKind() === SyntaxKind.PropertyAccessExpression
      ? expression.asKindOrThrow(SyntaxKind.PropertyAccessExpression).getName()
      : expression.getText();
    if (callName === 'useGlobalGuards') result.push({ scope: 'global', kind: 'useGlobalGuards', expression: call.getText(), source: sourceLocation(source, root, call.getStartLineNumber()), semantics: 'UNKNOWN' });
  }
  for (const identifier of source.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (identifier.getText() !== 'APP_GUARD') continue;
    const registration = identifier.getParent();
    if (registration?.getKind() !== SyntaxKind.PropertyAssignment) continue;
    const property = registration.asKindOrThrow(SyntaxKind.PropertyAssignment);
    if (property.getName() !== 'provide' || property.getInitializer()?.getText() !== 'APP_GUARD') continue;
    result.push({ scope: 'global', kind: 'APP_GUARD', expression: property.getParent()?.getText() ?? property.getText(), source: sourceLocation(source, root, identifier.getStartLineNumber()), semantics: 'UNKNOWN' });
  }
  return result;
}
function analyzeSource(source: SourceFile, root: string, hasGlobalDeclarations: boolean): { findings: RouteFinding[]; controllers: number; warnings: string[] } {
  const findings: RouteFinding[] = []; let controllers = 0; const warnings: string[] = [];
  const parseErrors = source.getProject().getProgram().getSyntacticDiagnostics(source);
  if (parseErrors.length) warnings.push(`${path.relative(root, source.getFilePath())}: contains TypeScript parse errors; declarations may be incomplete`);
  for (const controller of source.getClasses()) {
    const controllerDecorators = decorators(controller, 'Controller');
    if (!controllerDecorators.length) continue;
    controllers++;
    const rawPrefix = literalArg(controllerDecorators[0]!);
    const classMetadata = metadata(controller);
    for (const method of controller.getMethods()) {
      const routeDecorator = method.getDecorators().find((item) => item.getName() in routeMethods);
      if (!routeDecorator) continue;
      const verb = routeMethods[routeDecorator.getName()]!;
      const rawHandler = literalArg(routeDecorator);
      const methodMetadata = metadata(method);
      const localDeclarations = [...declarations(controller, 'controller', source, root), ...declarations(method, 'handler', source, root)];
      const guards = [...classMetadata.guards, ...methodMetadata.guards];
      const roles = [...classMetadata.roles, ...methodMetadata.roles];
      const isPublic = classMetadata.isPublic || methodMetadata.isPublic;
      const warningsForRoute: string[] = [];
      if (rawPrefix === null || rawHandler === null) warningsForRoute.push('A route path uses a non-literal expression and could not be resolved.');
      if (classMetadata.unresolved || methodMetadata.unresolved) warningsForRoute.push('One or more access declarations use unsupported or incomplete arguments.');
      if (roles.length && guards.length === 0) warningsForRoute.push('Roles are declared, but no local @UseGuards declaration was found; enforcement is not established.');
      if (isPublic) warningsForRoute.push('@Public marker found by name; its runtime semantics are not verified.');
      if (guards.length) warningsForRoute.push('A guard is declared locally; its behavior and any global authorization policy are not evaluated.');
      if (!guards.length && !roles.length && !isPublic) warningsForRoute.push('No recognized local access declaration was found; absence does not establish that this route is public.');
      const unknownDecorators = [...controller.getDecorators(), ...method.getDecorators()].map((item) => item.getName()).filter((name) => name !== 'Controller' && !Object.hasOwn(routeMethods, name) && !accessDecorators.has(name));
      if (unknownDecorators.length) warningsForRoute.push(`Uninterpreted controller or handler decorators: ${[...new Set(unknownDecorators)].join(', ')}.`);
      if (hasGlobalDeclarations) warningsForRoute.push('Global authorization declarations were observed in scanned source; route scope and behavior are not established.');
      const unresolvedPath = rawPrefix === null || rawHandler === null;
      const hasUnknownDecoratorSemantics = localDeclarations.some((declaration) => declaration.semantics === 'UNKNOWN' && declaration.kind !== 'Public');
      const status = unresolvedPath || classMetadata.unresolved || methodMetadata.unresolved || hasUnknownDecoratorSemantics || (unknownDecorators.length > 0 && !guards.length && !roles.length && !isPublic)
        ? 'UNRESOLVED' as const
        : !isPublic && (guards.length > 0 || roles.length > 0) ? 'DECLARED' as const : 'REQUIRES_REVIEW' as const;
      const facts = [`${verb} route decorator @${routeDecorator.getName()} found`, `Controller @Controller(${rawPrefix === '' ? '""' : rawPrefix === null ? '<dynamic>' : JSON.stringify(rawPrefix)})`, `Handler @${routeDecorator.getName()}(${rawHandler === '' ? '""' : rawHandler === null ? '<dynamic>' : JSON.stringify(rawHandler)})`];
      if (guards.length) facts.push(`Guards: ${guards.join(', ')}`);
      if (roles.length) facts.push(`Roles: ${roles.join(', ')}`);
      if (isPublic) facts.push('@Public decorator name found');
      findings.push({ method: verb, controllerPath: rawPrefix, handlerPath: rawHandler, controllerPathExpression: pathExpression(controllerDecorators[0]!), handlerPathExpression: pathExpression(routeDecorator), controllerPathSource: sourceLocation(source, root, controllerDecorators[0]!.getStartLineNumber()), handlerPathSource: sourceLocation(source, root, routeDecorator.getStartLineNumber()), routePath: joinPaths(rawPrefix, rawHandler), controller: controller.getName() ?? '<anonymous>', handler: method.getName(), source: sourceLocation(source, root, routeDecorator.getStartLineNumber()), authorizationDeclarations: localDeclarations, guards, roles, publicMarker: isPublic, status, facts, warnings: [...new Set(warningsForRoute)] });
    }
  }
  return { findings, controllers, warnings };
}

export interface SourceText { file: string; content: string }

export function analyzeSourceTexts(inputPath: string, sourceTexts: SourceText[]): AnalysisResult {
  const absolute = path.resolve(inputPath);
  const files = sourceTexts.filter((source) => isAnalyzableSourcePath(source.file)).sort((a, b) => a.file.localeCompare(b.file));
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true, compilerOptions: { experimentalDecorators: true } });
  const warnings: string[] = [];
  for (const source of files) {
    const sourcePath = path.resolve(absolute, source.file);
    const relativeSource = path.relative(absolute, sourcePath);
    if (!relativeSource || relativeSource.startsWith('..') || path.isAbsolute(relativeSource)) throw new Error(`Source path escapes scan root: ${source.file}`);
    project.createSourceFile(sourcePath, source.content, { overwrite: true });
  }
  const findings: RouteFinding[] = []; const globalDeclarations: AuthorizationDeclaration[] = []; let controllersFound = 0;
  for (const source of project.getSourceFiles()) globalDeclarations.push(...findGlobalDeclarations(source, absolute));
  const hasGlobalDeclarations = globalDeclarations.length > 0;
  for (const source of project.getSourceFiles()) {
    const result = analyzeSource(source, absolute, hasGlobalDeclarations);
    findings.push(...result.findings); controllersFound += result.controllers; warnings.push(...result.warnings);
  }
  const uniqueGlobalDeclarations = [...new Map(globalDeclarations.map((declaration) => [`${declaration.source.file}:${declaration.source.line}:${declaration.kind}:${declaration.expression}`, declaration])).values()];
  return { schemaVersion: 1, root: absolute, scannedFiles: files.length, controllersFound, findings, globalDeclarations: uniqueGlobalDeclarations, warnings: [...new Set(warnings)].sort() };
}

export function analyzePath(inputPath: string): AnalysisResult {
  const absolute = path.resolve(inputPath);
  let stat;
  try { stat = (awaitStat(absolute)); } catch { throw new Error(`Path does not exist or cannot be read: ${inputPath}`); }
  if (!stat.isDirectory()) throw new Error(`Expected a directory path: ${inputPath}`);
  const skippedSymlinks: string[] = [];
  const files = collectFiles(absolute, absolute, skippedSymlinks).map((file) => ({ file: path.relative(absolute, file), content: readFileSync(file, 'utf8') }));
  const result = analyzeSourceTexts(absolute, files);
  const warnings = skippedSymlinks.sort().map((file) => `Skipped symbolic link during analysis: ${file}`);
  return warnings.length ? { ...result, warnings: [...result.warnings, ...warnings].sort() } : result;
}
function awaitStat(file: string) { return statSync(file); }
