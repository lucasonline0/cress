import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanFrameworkApplications } from '../src/multiframework/scan.js';

describe('experimental framework adapters', () => {
  it('retains application identity and source for mixed projects', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'cress-mixed-'));
    try {
      mkdirSync(path.join(root, 'api'), { recursive: true });
      mkdirSync(path.join(root, 'web/app/api/users'), { recursive: true });
      writeFileSync(path.join(root, 'api/go.mod'), 'module sample\nrequire github.com/go-chi/chi/v5 v5.0.0\n');
      writeFileSync(path.join(root, 'api/main.go'), 'package main\nimport "github.com/go-chi/chi/v5"\nfunc f(){r:=chi.NewRouter(); r.Get("/users", handler)}');
      writeFileSync(path.join(root, 'web/package.json'), '{"dependencies":{"next":"1"}}');
      writeFileSync(path.join(root, 'web/app/api/users/route.ts'), 'export function GET() { return auth() }');
      const result = scanFrameworkApplications(root);
      expect(result.applications).toHaveLength(2);
      expect(result.routes.map(r => [r.framework, r.application, r.method, r.path])).toEqual([
        ['go-chi', 'api', 'GET', '/users'], ['nextjs', 'web', 'GET', '/api/users'],
      ]);
      expect(result.routes[1]?.declarations[0]?.semantics).toBe('UNKNOWN');
      expect(result.routes[1]?.source.file).toBe('web/app/api/users/route.ts');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
