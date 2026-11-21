import { parse } from 'yaml';
import type { ProjectAnalysis, ProjectRoute } from './project.js';
import { evaluatePolicies, type Policy } from './policies.js';

export interface Expectation { profile: string; access: 'allow' | 'deny' | 'conditional'; condition?: string }
export interface MatrixEntry { framework: ProjectRoute['framework']; application: string; method: string; path: string; expectations: Expectation[]; requiredDeclarations: string[] }
export interface AccessMatrix { profiles: string[]; entries: MatrixEntry[] }
export const emptyMatrix = (): AccessMatrix => ({ profiles: [], entries: [] });
export function validateMatrix(value: unknown): AccessMatrix {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid access matrix.');
  const m = value as AccessMatrix;
  if (!Array.isArray(m.profiles) || !m.profiles.every(p => typeof p === 'string' && p.trim() === p && p.length > 0 && p.length <= 100) || new Set(m.profiles).size !== m.profiles.length || !Array.isArray(m.entries)) throw new Error('Invalid matrix profiles or entries.');
  const keys = new Set<string>();
  for (const e of m.entries) {
    if (!e || !['nestjs', 'nextjs', 'go-chi'].includes(e.framework) || typeof e.application !== 'string' || !e.application || typeof e.method !== 'string' || !/^[A-Z]+$/.test(e.method) || typeof e.path !== 'string' || !e.path.startsWith('/') || !Array.isArray(e.requiredDeclarations) || !e.requiredDeclarations.every(d => typeof d === 'string' && !!d.trim() && d === d.trim()) || !Array.isArray(e.expectations)) throw new Error('Invalid matrix entry.');
    const key = JSON.stringify([e.framework, e.application, e.method, e.path]);
    if (keys.has(key)) throw new Error('Duplicate matrix entry.'); keys.add(key);
    const profiles = new Set<string>();
    for (const x of e.expectations) {
      if (!x || !m.profiles.includes(x.profile) || profiles.has(x.profile) || !['allow', 'deny', 'conditional'].includes(x.access) || (x.condition !== undefined && typeof x.condition !== 'string') || (x.access === 'conditional' && !x.condition?.trim())) throw new Error('Invalid matrix expectation.');
      profiles.add(x.profile);
    }
  }
  return m;
}
export function entryMatches(e: MatrixEntry, r: ProjectRoute): boolean { return e.framework === r.framework && e.application === r.application && e.method === r.method && e.path === r.path; }
export function coverage(analysis: ProjectAnalysis, policies: Policy[], matrix: AccessMatrix) {
  const entries = analysis.routes.map(route => {
    const matching = matrix.entries.filter(e => entryMatches(e, route));
    const legacy = policies.filter(p => p.framework === route.framework && p.method === route.method && p.path === route.path && (!p.application || p.application === route.application));
    const configured = matching.length > 0 || legacy.length > 0;
    const checks = [...legacy, ...matching.filter(e => e.requiredDeclarations.length).map(e => ({ framework: e.framework, application: e.application, method: e.method, path: e.path, requiredDeclarations: e.requiredDeclarations }))];
    const evaluations = evaluatePolicies(checks, analysis);
    const evidence = evaluations.length && evaluations.every(e => e.status === 'PASS') ? 'observed' : evaluations.some(e => e.status === 'REVIEW_REQUIRED') ? 'review' : 'unknown';
    return { route, configured, evidence };
  });
  return { disclaimer: 'Policy coverage and static observations do not establish effective authorization.', entries };
}
const methods = new Set(['get','post','put','patch','delete','head','options','trace']);
function normalized(path: string): string { return path.replace(/\{([^/{}]+)\}/g, ':$1').replace(/:([A-Za-z0-9_]+)(?=\/|$)/g, ':').replace(/\/$/, '') || '/'; }
export function compareOpenApi(text: string, analysis: ProjectAnalysis) {
  const doc: unknown = parse(text, { uniqueKeys: true, maxAliasCount: 50 });
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || typeof (doc as { openapi?: unknown }).openapi !== 'string' || !(doc as { paths?: unknown }).paths || typeof (doc as { paths?: unknown }).paths !== 'object' || Array.isArray((doc as { paths?: unknown }).paths)) throw new Error('Expected an OpenAPI document with paths.');
  const root = doc as { paths: Record<string, unknown>; security?: unknown };
  const contract: Array<{method: string; path: string; security: boolean; unresolved: boolean}> = [];
  for (const [route, value] of Object.entries(root.paths)) {
    if (!route.startsWith('/') || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid OpenAPI path: ${route}`);
    const item = value as Record<string, unknown>;
    if ('$ref' in item) { contract.push({ method: 'UNRESOLVED', path: route, security: false, unresolved: true }); continue; }
    for (const [method, operation] of Object.entries(item)) if (methods.has(method.toLowerCase())) {
      if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new Error(`Invalid operation: ${method} ${route}`);
      const security = (operation as Record<string, unknown>).security ?? root.security;
      contract.push({ method: method.toUpperCase(), path: route, security: Array.isArray(security) && security.length > 0, unresolved: false });
    }
  }
  const matched = new Set<ProjectRoute>();
  const findings = contract.map(c => {
    const samePath = analysis.routes.filter(r => r.path !== null && normalized(r.path) === normalized(c.path));
    const candidates = samePath.filter(r => r.method === c.method);
    if (c.unresolved || candidates.length > 1) return { kind: 'ambiguous', contract: c, routes: candidates };
    if (!candidates.length) return { kind: samePath.length ? 'method_mismatch' : 'contract_only', contract: c, routes: samePath };
    const route = candidates[0]!; matched.add(route);
    return { kind: c.security ? 'security_review' : 'matched', contract: c, routes: [route] };
  });
  const ambiguousRoutes = new Set(findings.filter(f => f.kind === 'ambiguous').flatMap(f => f.routes));
  return { disclaimer: 'Security declarations require review; absent observations do not prove missing protection.', findings, codeOnly: analysis.routes.filter(r => !matched.has(r) && !ambiguousRoutes.has(r)) };
}
export interface TestScenario { profile: string; access: 'allow' | 'deny' | 'conditional'; condition?: string; expectedStatus?: number }
export function generateTest(route: ProjectRoute, expectations: TestScenario[]): string {
  if (!expectations.length) throw new Error('Select at least one test scenario.');
  for (const scenario of expectations) {
    if (!scenario || typeof scenario.profile !== 'string' || scenario.profile.length > 100 || !['allow', 'deny', 'conditional'].includes(scenario.access) || (scenario.condition !== undefined && typeof scenario.condition !== 'string') || (scenario.expectedStatus !== undefined && (!Number.isInteger(scenario.expectedStatus) || scenario.expectedStatus < 100 || scenario.expectedStatus > 599))) throw new Error('Invalid test scenario.');
  }
  const cases = expectations.map(x => ({ ...x, label: `${x.profile}: ${x.access}${x.condition ? ` (${x.condition})` : ''}` }));
  if (route.framework === 'go-chi') return `package main\n\nimport (\n  "net/http"\n  "net/http/httptest"\n  "testing"\n)\n\n// TODO: Assign the actual router, credentials, resource identifiers, and fixtures.\nfunc TestAuthorization(t *testing.T) {\n  var handler http.Handler // TODO: assign the actual handler\n  if handler == nil { t.Skip("TODO: configure handler and fixtures") }\n${cases.map(c => `  t.Run(${JSON.stringify(c.label)}, func(t *testing.T) {\n    req := httptest.NewRequest(${JSON.stringify(route.method)}, ${JSON.stringify(route.path ?? '/TODO')}, nil)\n    // TODO: set credentials, request body and resource identifiers for this scenario.\n    response := httptest.NewRecorder()\n    handler.ServeHTTP(response, req)\n    ${c.expectedStatus ? `if response.Code != ${c.expectedStatus} { t.Errorf("status = %d, want ${c.expectedStatus}", response.Code) }` : '_ = response // TODO: assert the explicitly expected status'}\n  })`).join('\n')}\n}\n`;
  return `// TODO: import describe, it, and expect if required by your Jest or Vitest setup.\n// Configure a test server and TEST_BASE_URL, credentials, request body and resource fixtures.\n// Replace route parameters, then remove .skip after completing the TODOs.\n// Route: ${route.method} ${route.path ?? 'unresolved'} (${route.framework})\ndescribe('authorization', () => {\n${cases.map(c => `  it.skip(${JSON.stringify(c.label)}, async () => {\n    const url = new URL(${JSON.stringify(route.path ?? '/TODO')}, process.env.TEST_BASE_URL);\n    // TODO: use the scenario's credentials and resource fixture.\n    const response = await fetch(url, { method: ${JSON.stringify(route.method)} });\n    ${c.expectedStatus ? `expect(response.status).toBe(${c.expectedStatus});` : '// TODO: assert the explicitly expected status.'}\n  });`).join('\n')}\n});\n`;
}
