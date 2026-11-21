import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { compareFrameworkProject } from '../src/multiframework/git.js';
import { compareProject } from '../src/multiframework/project-diff.js';

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

it('compares a Chi middleware change declared in a separate file', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cress-chi-helper-git-'));
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
  try {
    git('init', '-q'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
    writeFileSync(path.join(root, 'go.mod'), 'module sample\nrequire github.com/go-chi/chi/v5 v5.0.0\n');
    writeFileSync(path.join(root, 'main.go'), 'package api\nimport "github.com/go-chi/chi/v5"\nfunc f(){r:=chi.NewRouter();setup(r)}');
    const helper = (guard: string) => `package api\nimport "github.com/go-chi/chi/v5"\nfunc setup(r chi.Router){r.Use(${guard});r.Get("/x",handler)}`;
    writeFileSync(path.join(root, 'setup.go'), helper('oldGuard'));
    git('add', '.'); git('commit', '-qm', 'baseline');
    writeFileSync(path.join(root, 'setup.go'), helper('newGuard'));
    const result = compareFrameworkProject(root, 'HEAD');
    expect(result.before.routes[0]?.source.file).toBe('setup.go');
    expect(result.before.routes[0]?.declarations[0]?.expression).toBe('oldGuard');
    expect(result.after.routes[0]?.declarations[0]?.expression).toBe('newGuard');
    expect(result.changes.map(c => c.type)).toEqual(['DECLARATION_REMOVED', 'DECLARATION_ADDED']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('compares a direct router helper in another local Go package', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cress-chi-package-git-'));
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
  try {
    git('init', '-q'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
    mkdirSync(path.join(root, 'routes'));
    writeFileSync(path.join(root, 'go.mod'), 'module example.com/project\nrequire github.com/go-chi/chi/v5 v5.0.0\n');
    writeFileSync(path.join(root, 'main.go'), 'package api\nimport ("github.com/go-chi/chi/v5"; "example.com/project/routes")\nfunc f(){r:=chi.NewRouter();policies.Register(r)}');
    const helper = (guard: string) => `package policies\nimport "github.com/go-chi/chi/v5"\nfunc Register(r chi.Router){r.Use(${guard});r.Get("/x",handler)}`;
    writeFileSync(path.join(root, 'routes/routes.go'), helper('oldGuard'));
    git('add', '.'); git('commit', '-qm', 'baseline');
    writeFileSync(path.join(root, 'routes/routes.go'), helper('newGuard'));
    const result = compareFrameworkProject(root, 'HEAD');
    expect(result.before.routes[0]?.source.file).toBe('routes/routes.go');
    expect(result.before.routes[0]?.declarations[0]?.expression).toBe('oldGuard');
    expect(result.after.routes[0]?.declarations[0]?.expression).toBe('newGuard');
    expect(result.changes.map(c => c.type)).toEqual(['DECLARATION_REMOVED', 'DECLARATION_ADDED']);
    const shared = compareProject(root, 'HEAD');
    expect(shared.diff.changes[0]?.type).toBe('DECLARATION_MODIFIED');
    expect(shared.diff.changes[0]?.before?.source.file).toBe('routes/routes.go');
    expect(shared.diff.changes[0]?.after?.source.file).toBe('routes/routes.go');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
