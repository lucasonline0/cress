import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { compareProject } from '../src/multiframework/project-diff.js';

describe('versioned multi-framework Git comparison', () => {
  it('detects NestJS, Next.js and Chi changes in their own applications', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'cress-project-diff-'));
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
    try {
      git('init', '-q'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
      for (const dir of ['nest', 'web/app/api', 'api']) mkdirSync(path.join(root, dir), { recursive: true });
      writeFileSync(path.join(root, 'nest/package.json'), '{"dependencies":{"@nestjs/core":"1"}}');
      writeFileSync(path.join(root, 'nest/users.ts'), '@Controller("users") class Users { @Roles("admin") @Get() list() {} }');
      writeFileSync(path.join(root, 'web/package.json'), '{"dependencies":{"next":"1"}}');
      writeFileSync(path.join(root, 'web/app/api/route.ts'), 'export function GET() { return auth() }');
      writeFileSync(path.join(root, 'api/go.mod'), 'module x\nrequire github.com/go-chi/chi/v5 v5.0.0\n');
      writeFileSync(path.join(root, 'api/main.go'), 'package main\nimport "github.com/go-chi/chi/v5"\nfunc f(){r:=chi.NewRouter();r.Use(old);r.Get("/users",handler)}');
      git('add', '.'); git('commit', '-qm', 'baseline');
      writeFileSync(path.join(root, 'nest/users.ts'), '@Controller("users") class Users { @Roles("member") @Get() list() {} }');
      writeFileSync(path.join(root, 'web/app/api/route.ts'), 'export function GET() { return checkPermission() }');
      writeFileSync(path.join(root, 'api/main.go'), 'package main\nimport "github.com/go-chi/chi/v5"\nfunc f(){r:=chi.NewRouter();r.Use(newGuard);r.Get("/users",handler)}');
      const state = git('status', '--porcelain').toString();
      const result = compareProject(root, 'HEAD');
      expect(new Set(result.diff.changes.map(c => c.framework))).toEqual(new Set(['nestjs', 'nextjs', 'go-chi']));
      expect(result.diff.changes.every(c => c.type === 'DECLARATION_ADDED' || c.type === 'DECLARATION_REMOVED')).toBe(true);
      expect(git('status', '--porcelain').toString()).toBe(state);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
