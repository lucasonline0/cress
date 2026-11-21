import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeProjectSources } from '../src/multiframework/project.js';
import { evaluatePolicies, loadPolicies } from '../src/multiframework/policies.js';
import { compareProjectAnalyses } from '../src/multiframework/project-diff.js';

const policy = { framework: 'go-chi' as const, method: 'GET', path: '/test', requiredDeclarations: ['adminAuth'] };
function analysis(guard: string) { return analyzeProjectSources('.', [{ file: 'go.mod', content: 'module x\nrequire github.com/go-chi/chi/v5 v5.0.0' }, { file: 'main.go', content: `package main\nimport "github.com/go-chi/chi/v5"\nfunc f(){r:=chi.NewRouter();r.Use(${guard});r.Get("/test",handler)}` }]); }
describe('expected access policies', () => {
  it('validates configuration and allows missing configuration', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'cress-policy-'));
    try { expect(loadPolicies(root)).toEqual([]); writeFileSync(path.join(root, '.cress.json'), '{"policies":[{}]}'); expect(() => loadPolicies(root)).toThrow(/Invalid policy/); writeFileSync(path.join(root, '.cress.json'), JSON.stringify({ policies: [policy] })); expect(loadPolicies(root)).toEqual([policy]); } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('distinguishes observed, removed, and uncertain declarations with evidence', () => {
    const before = analysis('adminAuth'); const after = analysis('otherAuth');
    expect(evaluatePolicies([policy], before)[0]?.status).toBe('PASS');
    const removed = evaluatePolicies([policy], after, before)[0]!;
    expect(removed.status).toBe('REVIEW_REQUIRED'); expect(removed.evidence[0]?.source.file).toBe('main.go');
    expect(evaluatePolicies([policy], after)[0]?.status).toBe('UNKNOWN');
    expect(evaluatePolicies([{ ...policy, path: '/absent' }], after, before)[0]?.status).toBe('UNKNOWN');
    expect(evaluatePolicies([{ ...policy, requiredDeclarations: ['admin'] }], before)[0]?.status).toBe('UNKNOWN');
    expect(compareProjectAnalyses(before, after, 'HEAD').changes[0]?.declarationKind).toBe('middleware');
  });
});
