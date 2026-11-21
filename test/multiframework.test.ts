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

it('traces a direct Chi helper across files within the same Go package', async () => {
  const { scanFrameworkSources } = await import('../src/multiframework/scan.js');
  const result = scanFrameworkSources([
    { file: 'api/go.mod', content: 'module example\nrequire github.com/go-chi/chi/v5 v5.0.0\n' },
    { file: 'api/main.go', content: 'package api\nimport "github.com/go-chi/chi/v5"\nfunc routes(){r:=chi.NewRouter();r.Route("/v1",func(p chi.Router){setup(p);p.Get("/after",handler)})}' },
    { file: 'api/setup.go', content: 'package api\nimport "github.com/go-chi/chi/v5"\nfunc setup(r chi.Router){r.Use(guard);r.Get("/inside",handler)}' },
  ]);
  expect(result.routes.map(r => [r.path, r.source.file])).toEqual([['/v1/inside', 'api/setup.go'], ['/v1/after', 'api/main.go']]);
  expect(result.routes.map(r => r.declarations.map(d => [d.expression, d.source.file]))).toEqual([[['guard', 'api/setup.go']], [['guard', 'api/setup.go']]]);
});

it('does not resolve an ambiguous or locally shadowed Chi helper', async () => {
  const { scanFrameworkSources } = await import('../src/multiframework/scan.js');
  const manifest = { file: 'api/go.mod', content: 'module example\nrequire github.com/go-chi/chi/v5 v5.0.0\n' };
  const helper = 'package api\nimport "github.com/go-chi/chi/v5"\nfunc setup(r chi.Router){r.Get("/inside",handler)}';
  const main = 'package api\nimport "github.com/go-chi/chi/v5"\nfunc routes(){r:=chi.NewRouter();setup(r)}';
  const ambiguous = scanFrameworkSources([manifest, { file: 'api/main.go', content: main }, { file: 'api/a.go', content: helper }, { file: 'api/b.go', content: helper }]);
  expect(ambiguous.routes).toHaveLength(0);
  expect(ambiguous.warnings.some(w => w.includes('ambiguous or recursive'))).toBe(true);
  const shadowed = scanFrameworkSources([manifest, { file: 'api/main.go', content: main.replace('setup(r)', 'setup:=local;setup(r)') }, { file: 'api/a.go', content: helper }]);
  expect(shadowed.routes).toHaveLength(0);
});

it('does not pair helpers excluded by build constraints or shadowed by local variables', async () => {
  const { scanFrameworkSources } = await import('../src/multiframework/scan.js');
  const manifest = { file: 'api/go.mod', content: 'module example\nrequire github.com/go-chi/chi/v5 v5.0.0\n' };
  const helper = 'package api\nimport "github.com/go-chi/chi/v5"\nfunc setup(r chi.Router){r.Get("/inside",handler)}';
  const main = 'package api\nimport "github.com/go-chi/chi/v5"\nfunc routes(){r:=chi.NewRouter();setup(r)}';
  const constrained = scanFrameworkSources([manifest, { file: 'api/main.go', content: main }, { file: 'api/helper_windows.go', content: helper }]);
  expect(constrained.routes).toHaveLength(0);
  expect(constrained.warnings.some(w => w.includes('build constraints'))).toBe(true);
  const shadowed = scanFrameworkSources([manifest, { file: 'api/main.go', content: main.replace('setup(r)', 'var setup func(chi.Router);setup(r)') }, { file: 'api/helper.go', content: helper }]);
  expect(shadowed.routes).toHaveLength(0);
});

it('traces an exported Chi router helper in another local-module package', async () => {
  const { scanFrameworkSources } = await import('../src/multiframework/scan.js');
  const files = [
    { file: 'api/go.mod', content: 'module example.com/project\nrequire github.com/go-chi/chi/v5 v5.0.0\n' },
    { file: 'api/main.go', content: 'package api\nimport ("github.com/go-chi/chi/v5"; routes "example.com/project/routes")\nfunc f(){r:=chi.NewRouter();r.Use(rootGuard);routes.Register(r);r.Get("/after",handler)}' },
    { file: 'api/routes/routes.go', content: 'package policies\nimport "github.com/go-chi/chi/v5"\nfunc Register(r chi.Router){r.Use(packageGuard);r.Get("/inside",handler)}' },
  ];
  const result = scanFrameworkSources(files);
  expect(result.routes.map(r => [r.path, r.source.file])).toEqual([['/inside', 'api/routes/routes.go'], ['/after', 'api/main.go']]);
  expect(result.routes[1]?.declarations.map(d => [d.expression, d.source.file])).toEqual([['rootGuard', 'api/main.go'], ['packageGuard', 'api/routes/routes.go']]);
  const shadowed = scanFrameworkSources(files.map(f => f.file === 'api/main.go' ? { ...f, content: f.content.replace('routes.Register(r)', 'routes:=local;routes.Register(r)') } : f));
  expect(shadowed.routes.map(r => r.path)).toEqual(['/after']);
  expect(shadowed.routes[0]?.declarations.map(d => d.expression)).toEqual(['rootGuard']);
});
