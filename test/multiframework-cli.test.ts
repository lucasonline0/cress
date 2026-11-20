import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

describe('multi-framework CLI', () => {
  it('scans and compares mixed applications and exports a safe offline report', () => {
    const parent = mkdtempSync(path.join(os.tmpdir(), 'cress-cli-v2-')); const root = path.join(parent, 'project');
    mkdirSync(path.join(root, 'api'), { recursive: true }); mkdirSync(path.join(root, 'web/app/api/data'), { recursive: true });
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
    const cli = (...args: string[]) => execFileSync(process.execPath, ['--import', 'tsx', path.resolve('src/cli.ts'), ...args], { encoding: 'utf8' });
    try {
      git('init', '-q'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
      writeFileSync(path.join(root, 'api/go.mod'), 'module test\nrequire github.com/go-chi/chi/v5 v5.0.0\n');
      const go = path.join(root, 'api/main.go');
      writeFileSync(go, 'package main\nimport "github.com/go-chi/chi/v5"\nfunc f(){r:=chi.NewRouter();r.Use(oldGuard);r.Get("/test",handler)}');
      writeFileSync(path.join(root, 'web/package.json'), '{"dependencies":{"next":"1"}}');
      writeFileSync(path.join(root, 'web/app/api/data/route.ts'), 'export function GET(){return auth()}');
      git('add', '.'); git('commit', '-qm', 'baseline');
      writeFileSync(go, 'package main\nimport "github.com/go-chi/chi/v5"\nfunc f(){r:=chi.NewRouter();r.Use(newGuard);r.Get("/test",handler)}');
      const scan = JSON.parse(cli('scan', root, '--format', 'json'));
      expect(scan.schemaVersion).toBe(2);
      expect(scan.routes.map((r: { framework: string }) => r.framework)).toEqual(['go-chi', 'nextjs']);
      const diff = JSON.parse(cli('diff', root, '--base', 'HEAD', '--format', 'json'));
      expect(diff.changes[0].type).toBe('DECLARATION_MODIFIED');
      const output = path.join(parent, 'report.html');
      cli('report', root, '--base', 'HEAD', '--output', output);
      const html = readFileSync(output, 'utf8'); expect(html).toContain('go-chi'); expect(html).toContain('newGuard');
    } finally { rmSync(parent, { recursive: true, force: true }); }
  }, 30000);
});
