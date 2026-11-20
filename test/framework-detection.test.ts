import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectApplications } from '../src/multiframework/detection.js';

describe('framework detection', () => {
  it('finds manifest evidence in nested applications and ignores dependencies and symlinks', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'cress-framework-'));
    try {
      for (const dir of ['web', 'api', 'node_modules/fake']) mkdirSync(path.join(root, dir), { recursive: true });
      writeFileSync(path.join(root, 'web/package.json'), JSON.stringify({ dependencies: { next: '1' } }));
      writeFileSync(path.join(root, 'api/go.mod'), 'module example\nrequire github.com/go-chi/chi/v5 v5.0.0\n');
      writeFileSync(path.join(root, 'node_modules/fake/package.json'), '{"dependencies":{"@nestjs/core":"1"}}');
      if (process.platform !== 'win32') symlinkSync(path.join(root, 'web'), path.join(root, 'alias'));
      expect(detectApplications(root)).toEqual([{ framework: 'go-chi', root: 'api' }, { framework: 'nextjs', root: 'web' }]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('does not infer support from folder names or invalid manifests', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'cress-framework-'));
    try { mkdirSync(path.join(root, 'app/api'), { recursive: true }); writeFileSync(path.join(root, 'package.json'), '{'); expect(detectApplications(root)).toEqual([]); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });
});
