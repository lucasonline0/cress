import { parseDocument, LineCounter, isMap, isScalar } from 'yaml';
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
    return { route, configured, evidence, evaluations };
  });
  const unmatchedPolicies = [...policies, ...matrix.entries.map(e => ({framework: e.framework, application: e.application, method: e.method, path: e.path, requiredDeclarations: e.requiredDeclarations}))].flatMap(policy => { const matches = analysis.routes.filter(r => r.framework === policy.framework && r.method === policy.method && r.path === policy.path && (!policy.application || r.application === policy.application)); return matches.length === 1 ? [] : [{policy, reason: matches.length ? 'ambiguous' : 'route_not_found', routes: matches}]; });
  return { disclaimer: 'Policy coverage and static observations do not establish effective authorization.', entries, unmatchedPolicies };
}
const methods = new Set(['get','post','put','patch','delete','head','options','trace']);
function normalized(path: string): string { return path.replace(/\{([^/{}]+)\}/g, ':$1').replace(/:([A-Za-z0-9_]+)(?=\/|$)/g, ':').replace(/\/$/, '') || '/'; }
export function compareOpenApi(text: string, analysis: ProjectAnalysis, matrix: AccessMatrix = emptyMatrix(), sourceFile = 'OpenAPI document') {
  const lines = new LineCounter();
  const parsed = parseDocument(text, { uniqueKeys: true, lineCounter: lines });
  if (parsed.errors.length) throw new Error(`Invalid OpenAPI document: ${parsed.errors[0]!.message}`);
  const doc: unknown = parsed.toJS({ maxAliasCount: 50 });
  const pathNodes = parsed.get('paths', true);
  const findKey = (map: unknown, key: string) => isMap(map) ? map.items.find(pair => isScalar(pair.key) && pair.key.value === key) : undefined;
  const location = (route: string, method?: string) => {
    const pathEntry = findKey(pathNodes, route);
    const operation = method ? findKey(pathEntry?.value, method) : undefined;
    const key = operation?.key ?? pathEntry?.key;
    const offset = isScalar(key) ? key.range?.[0] : undefined;
    return { file: sourceFile, line: offset === undefined ? null : lines.linePos(offset).line };
  };
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || typeof (doc as { openapi?: unknown }).openapi !== 'string' || !(doc as { paths?: unknown }).paths || typeof (doc as { paths?: unknown }).paths !== 'object' || Array.isArray((doc as { paths?: unknown }).paths)) throw new Error('Expected an OpenAPI document with paths.');
  const root = doc as { paths: Record<string, unknown>; security?: unknown };
  const contract: Array<{method: string; path: string; security: boolean; unresolved: boolean; source: {file: string; line: number | null}} > = [];
  for (const [route, value] of Object.entries(root.paths)) {
    if (!route.startsWith('/') || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid OpenAPI path: ${route}`);
    const item = value as Record<string, unknown>;
    if ('$ref' in item) { contract.push({ method: 'UNRESOLVED', path: route, security: false, unresolved: true, source: location(route, '$ref') }); continue; }
    for (const [method, operation] of Object.entries(item)) if (methods.has(method.toLowerCase())) {
      if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new Error(`Invalid operation: ${method} ${route}`);
      const security = (operation as Record<string, unknown>).security ?? root.security;
      contract.push({ method: method.toUpperCase(), path: route, security: Array.isArray(security) && security.length > 0, unresolved: false, source: location(route, method) });
    }
  }
  const matched = new Set<ProjectRoute>();
  const findings = contract.map(c => {
    const samePath = analysis.routes.filter(r => r.path !== null && normalized(r.path) === normalized(c.path));
    const candidates = samePath.filter(r => r.method === c.method);
    if (c.unresolved || candidates.length > 1 || contract.filter(other => !other.unresolved && other.method === c.method && normalized(other.path) === normalized(c.path)).length > 1) return { kind: 'ambiguous', contract: c, routes: candidates };
    if (!candidates.length) return { kind: samePath.length ? 'method_mismatch' : 'contract_only', contract: c, routes: samePath };
    const route = candidates[0]!; matched.add(route);
    const entry = matrix.entries.find(e => entryMatches(e, route));
    const expectations = entry?.expectations ?? [];
    const mismatch = expectations.length > 0 && (c.security || expectations.some(e => e.access !== 'allow'));
    return { kind: mismatch ? 'expectation_review' : c.security ? 'security_review' : 'matched', contract: c, routes: [route], expectations };
  });
  const ambiguousRoutes = new Set(findings.filter(f => f.kind === 'ambiguous').flatMap(f => f.routes));
  return { disclaimer: 'Security declarations require review; absent observations do not prove missing protection.', findings, codeOnly: analysis.routes.filter(r => !matched.has(r) && !ambiguousRoutes.has(r)) };
}
export interface TestScenario { profile: string; access: 'allow' | 'deny' | 'conditional'; condition?: string; expectedStatus?: number; userId?: string; resourceId?: string; organizationId?: string; relationship?: 'own' | 'other'; resourceParameter?: string }
export type TestRunner = 'jest' | 'vitest';
export function generateTest(route: ProjectRoute, expectations: TestScenario[], runner: TestRunner = 'jest'): string {
  if (!expectations.length) throw new Error('Select at least one test scenario.');
  if (!['jest', 'vitest'].includes(runner)) throw new Error('Invalid test runner.');
  for (const scenario of expectations) {
    if (!scenario || typeof scenario.profile !== 'string' || scenario.profile.length > 100 || !['allow', 'deny', 'conditional'].includes(scenario.access) || (scenario.condition !== undefined && typeof scenario.condition !== 'string') || (scenario.expectedStatus !== undefined && (!Number.isInteger(scenario.expectedStatus) || scenario.expectedStatus < 100 || scenario.expectedStatus > 599)) || (scenario.relationship !== undefined && !['own', 'other'].includes(scenario.relationship)) || [scenario.userId, scenario.resourceId, scenario.organizationId, scenario.resourceParameter].some(x => x !== undefined && (typeof x !== 'string' || x.length > 500))) throw new Error('Invalid test scenario.');
  }
  const cases = expectations.map(x => ({ ...x, requestPath: x.resourceParameter && x.resourceId ? (route.path ?? '/TODO').split('/').map(segment => segment === `:${x.resourceParameter}` || segment === `{${x.resourceParameter}}` ? encodeURIComponent(x.resourceId!) : segment).join('/') : (route.path ?? '/TODO'), label: `${x.profile}: ${x.access}${x.relationship ? ` / ${x.relationship} resource` : ''}${x.condition ? ` (${x.condition})` : ''}` }));
  if (route.framework === 'go-chi') return `package TODO // TODO: replace with the package containing the real router\n\nimport (\n  "net/http"\n  "net/http/httptest"\n  "testing"\n)\n\n// TODO: assign the real handler and prepare users, credentials and resources.\nfunc TestAuthorization(t *testing.T) {\n  var handler http.Handler // TODO: assign the actual handler\n  if handler == nil { t.Skip("TODO: configure handler and fixtures") }\n${cases.map(c => `  t.Run(${JSON.stringify(c.label)}, func(t *testing.T) {\n    // Fixture: user=${JSON.stringify(c.userId || 'TODO')}, resource=${JSON.stringify(c.resourceId || 'TODO')}, organization=${JSON.stringify(c.organizationId || 'TODO')}.\n    req := httptest.NewRequest(${JSON.stringify(route.method)}, ${JSON.stringify(c.requestPath)}, nil)\n    // TODO: substitute resource IDs, attach the appropriate credentials and request body.\n    response := httptest.NewRecorder()\n    handler.ServeHTTP(response, req)\n    ${c.expectedStatus ? `if response.Code != ${c.expectedStatus} { t.Errorf("status = %d, want ${c.expectedStatus}", response.Code) }` : '_ = response // TODO: assert the explicitly expected status'}\n  })`).join('\n')}\n}\n`;
  return `${runner === 'vitest' ? "import { describe, it, expect } from 'vitest';\n" : '// Jest globals must be enabled or imported from @jest/globals in your project.\n'}// TODO: configure TEST_BASE_URL, credentials, request bodies and fixtures.\n// Replace route parameters and remove .skip after completing each scenario.\ndescribe('authorization', () => {\n${cases.map(c => `  it.skip(${JSON.stringify(c.label)}, async () => {\n    const fixture = ${JSON.stringify({userId: c.userId || 'TODO', resourceId: c.resourceId || 'TODO', organizationId: c.organizationId || 'TODO'})};\n    // TODO: use fixture and credentials for this scenario; replace path parameters.\n    void fixture;\n    const baseUrl = process.env.TEST_BASE_URL;\n    if (!baseUrl) throw new Error('Set TEST_BASE_URL');\n    const response = await fetch(new URL(${JSON.stringify(c.requestPath)}, baseUrl), { method: ${JSON.stringify(route.method)} });\n    ${c.expectedStatus ? `expect(response.status).toBe(${c.expectedStatus});` : '// TODO: assert the expected status.'}\n  });`).join('\n')}\n});\n`;
}
