import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compareOpenApi, generateTest, validateMatrix } from '../src/multiframework/experience.js';
import { detectTestRunners } from '../src/multiframework/test-runner.js';
import { loadMatrix, saveMatrix } from '../src/multiframework/matrix-store.js';
import { analyzeProjectSources } from '../src/multiframework/project.js';

const route = { framework: 'nextjs' as const, application: '.', method: 'GET', path: '/users/:id', handler: 'GET', source: { file: 'route.ts', line: 1 }, declarations: [], status: 'REQUIRES_REVIEW' as const, warnings: [] };
const analysis = { ...analyzeProjectSources('.', []), routes: [route] };
describe('access experience', () => {
  it('preserves legacy config and validates matrix expectations', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cress-matrix-'));
    try {
      writeFileSync(path.join(dir, '.cress.json'), JSON.stringify({ policies: [], custom: 42 }));
      expect(loadMatrix(dir).profiles).toEqual([]);
      const matrix = { profiles: ['USER'], entries: [{ framework: 'nextjs', application: '.', method: 'GET', path: '/users/:id', expectations: [{ profile: 'USER', access: 'conditional', condition: 'owner' }], requiredDeclarations: [] }] };
      saveMatrix(dir, matrix); expect(loadMatrix(dir)).toEqual(matrix); expect(JSON.parse(readFileSync(path.join(dir, '.cress.json'), 'utf8')).custom).toBe(42);
      expect(() => validateMatrix({ ...matrix, profiles: [] })).toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('refuses symlinked configuration', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cress-link-'));
    try { writeFileSync(path.join(dir, 'target'), '{"policies":[]}'); symlinkSync(path.join(dir, 'target'), path.join(dir, '.cress.json')); expect(() => saveMatrix(dir, {profiles: [], entries: []})).toThrow(); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('compares YAML paths and retains ambiguity', () => {
    const yaml = 'openapi: 3.0.0\npaths:\n  /users/{id}:\n    get:\n      security:\n        - bearer: []\n';
    expect(compareOpenApi(yaml, analysis).findings[0]?.kind).toBe('security_review');
    expect(compareOpenApi(yaml, { ...analysis, routes: [route, { ...route, application: 'other' }] }).findings[0]?.kind).toBe('ambiguous');
    expect(() => compareOpenApi('paths: []', analysis)).toThrow();
  });
  it('generates honest editable templates with unauthenticated and explicit scenarios', () => {
    const result = generateTest(route, [{profile: 'Unauthenticated', access: 'deny'}, {profile: 'ADMIN', access: 'allow'}]);
    expect(result).toContain('Unauthenticated'); expect(result).toContain('ADMIN'); expect(result).toContain('TODO');
    expect(generateTest({ ...route, framework: 'go-chi' }, [{profile: 'Unauthenticated', access: 'deny'}])).toContain('httptest.NewRequest');
  });
  it('detects test runners without executing project configuration', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cress-runner-'));
    try { writeFileSync(path.join(dir, 'package.json'), JSON.stringify({devDependencies: {vitest: '*', jest: '*'}})); writeFileSync(path.join(dir, 'jest.config.js'), 'throw new Error("must not run")'); expect(detectTestRunners(dir, '.').sort()).toEqual(['jest', 'vitest']); expect(() => detectTestRunners(dir, '..')).toThrow(); }
    finally { rmSync(dir, {recursive: true, force: true}); }
  });
  it('renders explicit resource scenarios and reviews contract expectations', () => {
    const scenarios = [{profile: 'USER', access: 'conditional' as const, relationship: 'own' as const, resourceParameter: 'id', userId: 'u1', resourceId: 'r1', expectedStatus: 200}, {profile: 'USER', access: 'deny' as const, relationship: 'other' as const, resourceId: 'r2', expectedStatus: 403}];
    const output = generateTest(route, scenarios, 'vitest'); expect(output).toContain("from 'vitest'"); expect(output).toContain('/users/r1'); expect(output).toContain('r2'); expect(output).toContain('toBe(403)');
    const matrix = {profiles: ['USER'], entries: [{framework: 'nextjs' as const, application: '.', method: 'GET', path: '/users/:id', expectations: [{profile: 'USER', access: 'deny' as const}], requiredDeclarations: []}]};
    expect(compareOpenApi('openapi: 3.0.0\npaths:\n  /users/{id}:\n    get: {}', analysis, matrix).findings[0]?.kind).toBe('expectation_review');
  });
});
