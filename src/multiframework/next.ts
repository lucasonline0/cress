import { Project, SyntaxKind } from 'ts-morph';

export interface NextObservation { expression: string; file: string; line: number }
export interface NextRoute { method: string; path: string | null; handler: string; file: string; line: number; observations: NextObservation[] }
export interface NextResult { routes: NextRoute[]; warnings: string[] }
const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

/** Interpret conventional API file names and exported handlers, without executing imports. */
export function analyzeNextSource(file: string, content: string): NextResult {
  const normalized = file.replaceAll('\\', '/');
  const app = normalized.match(/^(?:src\/)?app\/api\/(.*\/)?route\.(?:ts|tsx|js|jsx)$/);
  const pages = normalized.match(/^(?:src\/)?pages\/api\/(.+)\.(?:ts|tsx|js|jsx)$/);
  if (!app && !pages) return { routes: [], warnings: [] };
  const segments = (app ? (app[1] ?? '').split('/') : pages![1]!.split('/')).filter(Boolean);
  if (pages && segments.at(-1) === 'index') segments.pop();
  const warnings: string[] = [];
  const pathSegments = segments.filter(s => !/^\(.+\)$/.test(s));
  const unresolvedPath = pathSegments.some(s => s.startsWith('@') || s.includes('('));
  if (unresolvedPath) warnings.push(`${file}: parallel or intercepted routes require review.`);
  const routePath = unresolvedPath ? null : '/api' + (pathSegments.length ? '/' + pathSegments.join('/') : '');
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true, compilerOptions: { allowJs: true } });
  const source = project.createSourceFile(file, content);
  const parseDiagnostics = (source.compilerNode as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics;
  if (parseDiagnostics?.length) warnings.push(`${file}: malformed source; route coverage may be incomplete.`);
  const routes: NextRoute[] = [];
  for (const [name, declarations] of source.getExportedDeclarations()) {
    if ((app && methods.has(name)) || (pages && name === 'default')) {
      const declaration = declarations[0]; if (!declaration) continue;
      const observations = declaration.getDescendantsOfKind(SyntaxKind.CallExpression).filter(call => /(?:auth|session|role|permission|authoriz)/i.test(call.getExpression().getText())).map(call => ({ expression: call.getText(), file, line: call.getStartLineNumber() }));
      for (const conditional of declaration.getDescendantsOfKind(SyntaxKind.IfStatement)) {
        const condition = conditional.getExpression();
        if (/(?:role|permission|authoriz)/i.test(condition.getText())) observations.push({ expression: condition.getText(), file, line: condition.getStartLineNumber() });
      }
      if (pages) {
        const switches = declaration.getDescendantsOfKind(SyntaxKind.SwitchStatement).filter(statement => /^[A-Za-z_$][\w$]*\.method$/.test(statement.getExpression().getText()));
        if (switches.length === 1) {
          const clauses = switches[0]!.getCaseBlock().getClauses();
          const fallback = clauses.find(clause => clause.getKind() === SyntaxKind.DefaultClause);
          const rejectsOtherMethods = fallback?.getDescendantsOfKind(SyntaxKind.ReturnStatement).some(statement => /\.status\(405\)/.test(statement.getText()));
          const cases = clauses.filter(clause => clause.getKind() === SyntaxKind.CaseClause).map(clause => clause.asKindOrThrow(SyntaxKind.CaseClause));
          if (rejectsOtherMethods && cases.length && cases.every(clause => clause.getExpression().getKind() === SyntaxKind.StringLiteral && methods.has(clause.getExpression().getText().slice(1, -1)) && clause.getDescendantsOfKind(SyntaxKind.ReturnStatement).length > 0)) {
            for (const clause of cases) routes.push({ method: clause.getExpression().getText().slice(1, -1), path: routePath, handler: name, file, line: clause.getStartLineNumber(), observations });
            continue;
          }
        }
      }
      routes.push({ method: app ? name : 'UNRESOLVED', path: routePath, handler: name, file, line: declaration.getStartLineNumber(), observations });
    }
  }
  if (pages && routes.some(route => route.method === 'UNRESOLVED')) warnings.push(`${file}: Pages Router HTTP method requires review.`);
  return { routes, warnings };
}

/** Record root middleware configuration without assuming whether any route is covered. */
export function analyzeNextMiddleware(file: string, content: string): NextObservation[] {
  const normalized = file.replaceAll('\\', '/');
  if (!/^(?:src\/)?middleware\.(?:ts|tsx|js|jsx)$/.test(normalized)) return [];
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true, compilerOptions: { allowJs: true } });
  const source = project.createSourceFile(normalized, content);
  const observations: NextObservation[] = [];
  const config = source.getVariableDeclaration('config');
  if (config && source.getExportedDeclarations().has('config')) {
    const initializer = config.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
    const matcher = initializer?.getProperty('matcher');
    if (matcher) observations.push({ expression: matcher.getText(), file, line: matcher.getStartLineNumber() });
  }
  for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (/(?:auth|session|role|permission|authoriz)/i.test(call.getExpression().getText())) observations.push({ expression: call.getText(), file, line: call.getStartLineNumber() });
  }
  return observations;
}
