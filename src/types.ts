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
