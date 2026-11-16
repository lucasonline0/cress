import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { comparePath } from '../src/diff.js';
import { formatDiffJson } from '../src/diff-format.js';
import { createHtmlReport } from '../src/report.js';
import { analyzePath } from '../src/analyzer.js';

const tempDirs: string[] = [];
function git(root: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
function repo(source: string): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cress-git-test-')); tempDirs.push(root);
  mkdirSync(path.join(root, 'src'), { recursive: true }); writeFileSync(path.join(root, 'src', 'routes.ts'), source);
  git(root, 'init', '-q'); git(root, 'config', 'user.email', 'cress-test@example.invalid'); git(root, 'config', 'user.name', 'Cress Test');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'baseline');
  return root;
}
function update(root: string, source: string): void { writeFileSync(path.join(root, 'src', 'routes.ts'), source); }
afterEach(() => { for (const root of tempDirs.splice(0)) rmSync(root, { recursive: true, force: true }); });
const basic = `@Controller('users') class Users { @Get() list() {} }`;
describe('Git authorization comparison', () => {
  it('finds added and removed routes with traceable source', () => {
    const root = repo(basic); update(root, `@Controller('users') class Users { @Get() list() {} @Post('') create() {} }`);
    const added = comparePath(root, 'HEAD');
    expect(added.changes.map((item) => item.type)).toContain('ROUTE_ADDED');
    expect(added.changes.find((item) => item.type === 'ROUTE_ADDED')?.after?.source.file).toBe('src/routes.ts');
    update(root, `@Controller('users') class Users {}`);
    expect(comparePath(root, 'HEAD').changes.map((item) => item.type)).toContain('ROUTE_REMOVED');
    update(root, `@Controller('accounts') class Users { @Get() list() {} }`);
    const moved = comparePath(root, 'HEAD').changes.find((item) => item.type === 'ROUTE_MODIFIED');
    expect(moved?.before?.source.line).toBe(1); expect(moved?.after?.source.line).toBe(1);
  });
  it('detects changed roles and removed method guard declarations', () => {
    const root = repo(`@Controller('users') class Users { @Get() @UseGuards(AuthGuard) @Roles('ADMIN') list() {} }`);
    update(root, `@Controller('users') class Users { @Get() @Roles('MEMBER') list() {} }`);
    const types = comparePath(root, 'HEAD').changes.map((item) => item.type);
    expect(types).toContain('DECLARATION_MODIFIED'); expect(types).toContain('DECLARATION_REMOVED');
  });
  it('keeps controller and handler scopes distinct', () => {
    const root = repo(`@Controller('users') @UseGuards(AuthGuard) class Users { @Get() list() {} }`);
    update(root, `@Controller('users') class Users { @Get() @UseGuards(AuthGuard) list() {} }`);
    const changes = comparePath(root, 'HEAD').changes;
    expect(changes.some((item) => item.type === 'DECLARATION_REMOVED' && item.declarationKind === 'controller:UseGuards')).toBe(true);
    expect(changes.some((item) => item.type === 'DECLARATION_ADDED' && item.declarationKind === 'handler:UseGuards')).toBe(true);
  });
  it('reports no changes and ignores unrelated working tree files', () => {
    const root = repo(basic);
    expect(comparePath(root, 'HEAD').changes).toEqual([]);
    writeFileSync(path.join(root, 'notes.txt'), 'unrelated');
    const result = comparePath(root, 'HEAD'); expect(result.changes).toEqual([]);
  });
  it('includes untracked source only on the working-tree side and says so', () => {
    const root = repo(`@Controller('users') class Users {}`);
    writeFileSync(path.join(root, 'src', 'new.controller.ts'), `@Controller('audit') class Audit { @Get() events() {} }`);
    const result = comparePath(root, 'HEAD');
    expect(result.changes.some((item) => item.type === 'ROUTE_ADDED')).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('untracked TypeScript'))).toBe(true);
  });
  it('keeps dynamic declaration changes unresolved and reports global declarations', () => {
    const root = repo(`@Controller('users') class Users { @Get() @Roles(role) list() {} }`);
    update(root, `@Controller('users') class Users { @Get() @Roles(nextRole) list() {} }\napp.useGlobalGuards(new AuthGuard());`);
    const result = comparePath(root, 'HEAD');
    expect(result.changes.some((item) => item.type === 'UNRESOLVED_CHANGE')).toBe(true);
    expect(result.changes.some((item) => item.routeId === '[global]' && item.declarationKind === 'global:useGlobalGuards')).toBe(true);
  });
  it('handles invalid refs and non-Git directories', () => {
    const root = repo(basic); const plain = mkdtempSync(path.join(os.tmpdir(), 'cress-nogit-')); tempDirs.push(plain);
    expect(() => comparePath(root, 'not-a-real-ref')).toThrow(/Git reference/);
    expect(() => comparePath(plain, 'HEAD')).toThrow();
  });
  it('is read-only and produces deterministic JSON', () => {
    const root = repo(basic); update(root, `@Controller('users') class Users { @Get() list() {} @Post() add() {} }`);
    const sourceBefore = readFileSync(path.join(root, 'src', 'routes.ts'), 'utf8');
    const one = formatDiffJson(comparePath(root, 'HEAD')); const two = formatDiffJson(comparePath(root, 'HEAD'));
    expect(one).toBe(two); expect(readFileSync(path.join(root, 'src', 'routes.ts'), 'utf8')).toBe(sourceBefore);
    expect(git(root, 'status', '--porcelain')).toContain('src/routes.ts');
  });
});

describe('offline HTML report', () => {
  it('escapes hostile source text and renders a standalone offline document', () => {
    const root = repo(`@Controller('<img src=x onerror=alert(1)>') class Users { @Get() list() {} }`);
    update(root, `@Controller('<img src=x onerror=alert(1)>') class Users { @Get() list() {} }`);
    const after = analyzePath(root); const before = analyzePath(root);
    const html = createHtmlReport({ before, after, diff: comparePath(root, 'HEAD') });
    expect(html.startsWith('<!doctype html>')).toBe(true); expect(html.endsWith('</html>\n')).toBe(true);
    expect(html).not.toContain('<img src=x'); expect(html).toContain('\\u003cimg');
    expect(html).not.toMatch(/(?:src|href)="https?:/i); expect(html).not.toContain('innerHTML');
    expect(html).toContain('textContent'); expect(html).toContain('Content-Security-Policy');
  });
});
