import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { compareFrameworkProject } from '../src/multiframework/git.js';

describe('framework Git snapshots', () => {
  it('compares baseline manifest and Chi source to the worktree without checkout', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'cress-multi-git-'));
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
    try {
      git('init', '-q'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
      mkdirSync(path.join(root, 'api'));
      writeFileSync(path.join(root, 'api/go.mod'), 'module sample\nrequire github.com/go-chi/chi/v5 v5.0.0\n');
      const source = (middleware: string) => `package main\nimport "github.com/go-chi/chi/v5"\nfunc f(){r:=chi.NewRouter();r.Use(${middleware});r.Get("/health",handler)}`;
      writeFileSync(path.join(root, 'api/main.go'), source('oldGuard'));
      git('add', '.'); git('commit', '-qm', 'baseline');
      writeFileSync(path.join(root, 'api/main.go'), source('newGuard'));
      const before = git('status', '--porcelain').toString();
      const result = compareFrameworkProject(root, 'HEAD');
      expect(result.before.routes[0]?.declarations[0]?.expression).toBe('oldGuard');
      expect(result.after.routes[0]?.declarations[0]?.expression).toBe('newGuard');
      expect(result.changes.map(c => c.type)).toEqual(['DECLARATION_REMOVED', 'DECLARATION_ADDED']);
      expect(git('status', '--porcelain').toString()).toBe(before);
      expect(() => compareFrameworkProject(root, 'invalid-ref')).toThrow(/Git reference/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
