import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzePath } from '../src/analyzer.js';
import { formatJson, formatTerminal } from '../src/format.js';
const tempDirs: string[] = [];
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cress-test-')); tempDirs.push(root);
  for (const [name, contents] of Object.entries(files)) {
    const full = path.join(root, name); mkdirSync(path.dirname(full), { recursive: true }); writeFileSync(full, contents);
  }
  return root;
}
afterEach(() => { for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const sample = `@Controller('api') @UseGuards(AuthGuard) class Example { @Get() list() {} @Post('item') @Roles('ADMIN') create() {} @Get(dynamicPath) detail() {} @Get('health') @Public() health() {} @Get('other') @Custom() other() {} }`;
describe('analyzePath', () => {
  it('combines literal paths and class/method metadata without claiming authorization', () => {
    const root = fixture({ 'routes.ts': sample }); const result = analyzePath(root);
    expect(result.findings.map((route) => route.routePath)).toEqual(['/api', '/api/item', null, '/api/health', '/api/other']);
    expect(result.findings[0]?.guards).toEqual(['AuthGuard']);
    expect(result.findings[1]?.roles).toEqual(['ADMIN']);
    expect(result.findings[3]?.publicMarker).toBe(true);
    expect(result.findings[0]?.status).toBe('DECLARED'); expect(result.findings[3]?.status).toBe('REQUIRES_REVIEW');
  });
  it('finds multiple supported verbs, empty prefixes, dynamic routes, and a possible global guard', () => {
    const root = fixture({ 'a.ts': `@Controller() class A { @Get('x') @UseGuards(AuthGuard) a() {} @Put('x') b() {} @Patch('x') c() {} @Delete('x') d() {} @Options('x') e() {} @Head('x') f() {} }`, 'main.ts': `app.useGlobalGuards(new AuthGuard())` });
    const result = analyzePath(root);
    expect(result.findings.map((route) => route.method)).toEqual(['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
    expect(result.findings.every((route) => route.warnings.some((warning) => warning.includes('Global authorization declarations')))).toBe(true);
    expect(result.globalDeclarations[0]).toMatchObject({ scope: 'global', kind: 'useGlobalGuards', semantics: 'UNKNOWN', source: { file: 'main.ts', line: 1 } });
  });
  it('records declaration scope and provenance without interpreting SetMetadata or APP_GUARD', () => {
    const root = fixture({ 'routes.ts': `@Controller('x') @UseGuards(ClassGuard) class A { @Get() @SetMetadata('policy', 'staff') @PolicyCheck() run() {} }`, 'app.ts': `const providers = [{ provide: APP_GUARD, useClass: PolicyGuard }];` });
    const result = analyzePath(root);
    expect(result.findings[0]?.authorizationDeclarations).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'controller', kind: 'UseGuards', semantics: 'OBSERVED', source: { file: 'routes.ts', line: 1 } }),
      expect.objectContaining({ scope: 'handler', kind: 'SetMetadata', semantics: 'UNKNOWN', source: { file: 'routes.ts', line: 1 } }),
      expect.objectContaining({ scope: 'handler', kind: 'PolicyCheck', semantics: 'UNKNOWN' }),
    ]));
    expect(result.findings[0]?.status).toBe('UNRESOLVED');
    expect(result.globalDeclarations).toEqual([expect.objectContaining({ scope: 'global', kind: 'APP_GUARD', semantics: 'UNKNOWN', source: { file: 'app.ts', line: 1 } })]);
  });
  it('reports malformed input and scans no generated or dependency directories', () => {
    const root = fixture({ 'broken.ts': '@Controller(\nclass Broken { @Get() hi( }', 'dist/ignore.ts': `@Controller() class Ignored { @Get() a() {} }`, 'node_modules/lib/x.ts': 'bad' });
    const result = analyzePath(root); expect(result.scannedFiles).toBe(1); expect(result.warnings.length).toBeGreaterThan(0);
  });
  it('handles empty and non-Nest directories and invalid paths', () => {
    const root = fixture({ 'ordinary.ts': 'export const value = 1;' });
    expect(analyzePath(root).findings).toEqual([]);
    const empty = mkdtempSync(path.join(os.tmpdir(), 'cress-empty-')); tempDirs.push(empty);
    expect(analyzePath(empty).scannedFiles).toBe(0);
    expect(() => analyzePath(path.join(root, 'missing'))).toThrow(/does not exist/);
    expect(formatTerminal(analyzePath(root))).toContain('no NestJS routes');
  });
  it('serializes deterministic valid JSON with traceable source facts', () => {
    const root = fixture({ 'a.ts': `@Controller('x') class A { @Get('y') get() {} }` });
    const result = analyzePath(root); const output = formatJson(result);
    expect(JSON.parse(output)).toEqual(result); expect(output).toBe(formatJson(analyzePath(root)));
    expect(result.findings[0]?.source).toEqual({ file: 'a.ts', line: 1 });
  });
});
