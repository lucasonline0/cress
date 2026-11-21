import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compareOpenApi, generateTest, validateMatrix } from '../src/multiframework/experience.js';
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
});
