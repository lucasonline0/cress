export type AnalysisStatus = 'DECLARED' | 'UNRESOLVED' | 'REQUIRES_REVIEW';
export interface SourceLocation { file: string; line: number }
export interface AuthorizationDeclaration {
  scope: 'global' | 'controller' | 'handler';
  kind: string;
  expression: string | null;
  source: SourceLocation;
  semantics: 'OBSERVED' | 'UNKNOWN';
}
export interface RouteFinding {
  method: string;
  controllerPath: string | null;
  handlerPath: string | null;
  controllerPathExpression: string;
  handlerPathExpression: string;
  controllerPathSource: SourceLocation;
  handlerPathSource: SourceLocation;
  routePath: string | null;
  controller: string;
  handler: string;
  source: SourceLocation;
  authorizationDeclarations: AuthorizationDeclaration[];
  guards: string[];
  roles: string[];
  publicMarker: boolean;
  status: AnalysisStatus;
  facts: string[];
  warnings: string[];
}
export interface AnalysisResult {
  schemaVersion: 1;
  root: string;
  scannedFiles: number;
  controllersFound: number;
  findings: RouteFinding[];
  globalDeclarations: AuthorizationDeclaration[];
  warnings: string[];
}

export type ChangeType = 'ROUTE_ADDED' | 'ROUTE_REMOVED' | 'ROUTE_MODIFIED' | 'DECLARATION_ADDED' | 'DECLARATION_REMOVED' | 'DECLARATION_MODIFIED' | 'UNRESOLVED_CHANGE';
export interface AuthorizationChange {
  type: ChangeType;
  routeId: string;
  route: { method: string; path: string | null; controller: string; handler: string } | null;
  declarationKind: string | null;
  before: { expression: string | null; source: SourceLocation } | null;
  after: { expression: string | null; source: SourceLocation } | null;
  review: string;
}
export interface DiffResult {
  schemaVersion: 1;
  base: string;
  root: string;
  changes: AuthorizationChange[];
  warnings: string[];
}
