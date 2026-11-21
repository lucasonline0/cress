import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Framework } from './detection.js';
import type { ProjectAnalysis, ProjectDeclaration, ProjectRoute } from './project.js';

export interface Policy { framework: Framework; method: string; path: string; requiredDeclarations: string[]; application?: string }
export interface PolicyResult { policy: Policy; status: 'PASS' | 'REVIEW_REQUIRED' | 'UNKNOWN'; missing: string[]; evidence: ProjectDeclaration[]; route: ProjectRoute['source'] | null; reason: string }
export function loadPolicies(root: string): Policy[] {
  const file = path.join(root, '.cress.json');
  if (!existsSync(file)) return [];
  let value: unknown;
  try { value = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { throw new Error(`Invalid .cress.json: ${error instanceof Error ? error.message : String(error)}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray((value as { policies?: unknown }).policies)) throw new Error('Invalid .cress.json: policies must be an array.');
  return (value as { policies: unknown[] }).policies.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Invalid policy ${index + 1}.`);
    const p = entry as Record<string, unknown>;
    if (!['nestjs', 'nextjs', 'go-chi'].includes(String(p.framework)) || typeof p.method !== 'string' || !/^[A-Z]+$/.test(p.method) || typeof p.path !== 'string' || !p.path.startsWith('/') || !Array.isArray(p.requiredDeclarations) || !p.requiredDeclarations.length || !p.requiredDeclarations.every(x => typeof x === 'string' && x.trim() === x && x.length > 0) || (p.application !== undefined && (typeof p.application !== 'string' || !p.application))) throw new Error(`Invalid policy ${index + 1}: expected framework, uppercase method, absolute path and nonempty requiredDeclarations.`);
    return p as unknown as Policy;
  });
}
function matches(expression: string | null, expected: string): boolean {
  if (!expression) return false;
  let index = expression.indexOf(expected);
  while (index >= 0) {
    const identifier = /[\w$]/;
    if (!identifier.test(expression[index - 1] ?? '') && !identifier.test(expression[index + expected.length] ?? '')) return true;
    index = expression.indexOf(expected, index + 1);
  }
  return false;
}
export function evaluatePolicies(policies: Policy[], analysis: ProjectAnalysis, baseline?: ProjectAnalysis): PolicyResult[] {
  return policies.map(policy => {
    const select = (a: ProjectAnalysis) => a.routes.filter(r => r.framework === policy.framework && r.method === policy.method && r.path === policy.path && (!policy.application || r.application === policy.application));
    const routes = select(analysis); const route = routes[0];
    if (routes.length !== 1 || !route) return { policy, status: 'UNKNOWN', missing: [], evidence: [], route: null, reason: routes.length ? 'Multiple routes match; specify an application or inspect ambiguous routes.' : 'Route not observed; analysis may be incomplete.' };
    const evidence = route.declarations.filter(d => policy.requiredDeclarations.some(expected => matches(d.expression, expected)));
    const missing = policy.requiredDeclarations.filter(expected => !evidence.some(d => matches(d.expression, expected)));
    if (!missing.length) return { policy, status: 'PASS', missing, evidence, route: route.source, reason: 'All expected declarations were observed; runtime access is not established.' };
    const prior = baseline ? select(baseline) : [];
    const removed = prior.length === 1 && prior[0]!.handler === route.handler && missing.some(expected => prior[0]!.declarations.some(d => matches(d.expression, expected)));
    return { policy, status: removed ? 'REVIEW_REQUIRED' : 'UNKNOWN', missing, evidence: [...evidence, ...(removed ? prior[0]!.declarations.filter(d => missing.some(expected => matches(d.expression, expected))) : [])], route: route.source, reason: removed ? 'An expected declaration observed at the baseline is no longer observed on this route. Review the source; other protection may exist.' : 'Expected declarations were not observed; analysis coverage is insufficient to establish their absence.' };
  });
}
