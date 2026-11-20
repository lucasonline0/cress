import { Project, SyntaxKind } from 'ts-morph';

export interface NextObservation { expression: string; file: string; line: number }
export interface NextRoute { method: string; path: string; handler: string; file: string; line: number; observations: NextObservation[] }
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
  if (pathSegments.some(s => s.startsWith('@') || s.includes('('))) warnings.push(`${file}: parallel or intercepted routes require review.`);
  const routePath = '/api' + (pathSegments.length ? '/' + pathSegments.join('/') : '');
  const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true, compilerOptions: { allowJs: true } });
  const source = project.createSourceFile(file, content);
  const routes: NextRoute[] = [];
  for (const [name, declarations] of source.getExportedDeclarations()) {
    if ((app && methods.has(name)) || (pages && name === 'default')) {
      const declaration = declarations[0]; if (!declaration) continue;
      const observations = declaration.getDescendantsOfKind(SyntaxKind.CallExpression).filter(call => /(?:auth|session|role|permission|authoriz)/i.test(call.getExpression().getText())).map(call => ({ expression: call.getText(), file, line: call.getStartLineNumber() }));
      routes.push({ method: app ? name : 'UNRESOLVED', path: routePath, handler: name, file, line: declaration.getStartLineNumber(), observations });
    }
  }
  if (pages && routes.length) warnings.push(`${file}: Pages Router HTTP method requires review.`);
  return { routes, warnings };
}
