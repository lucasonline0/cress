import { describe, expect, it } from 'vitest';
import { analyzeProjectSources } from '../src/multiframework/project.js';

describe('versioned project analysis', () => {
  it('keeps framework-specific fields separate and preserves NestJS provenance', () => {
    const result = analyzeProjectSources('/tmp/project', [
      { file: 'api/package.json', content: '{"dependencies":{"@nestjs/core":"1"}}' },
      { file: 'api/users.ts', content: '@Controller("users") class Users { @Get() list() {} }' },
      { file: 'web/package.json', content: '{"dependencies":{"next":"1"}}' },
      { file: 'web/app/api/users/route.ts', content: 'export function GET() { return auth() }' },
    ]);
    expect(result.schemaVersion).toBe(2);
    expect(result.routes.map(r => [r.framework, r.application, r.path])).toEqual([['nestjs', 'api', '/users'], ['nextjs', 'web', '/api/users']]);
    expect(result.routes[0]?.source.file).toBe('api/users.ts');
    expect(result.routes[0]?.nestjs?.controller).toBe('Users');
    expect(result.routes[1]?.nestjs).toBeUndefined();
  });
  it('distinguishes unsupported projects from recognized empty applications', () => {
    expect(analyzeProjectSources('/tmp/project', []).warnings).toContain('No supported API framework was detected.');
    expect(analyzeProjectSources('/tmp/project', [{ file: 'package.json', content: '{"dependencies":{"next":"1"}}' }]).warnings).toContain('Supported framework detected; no routes were recognized.');
  });
});

it('detects controller evidence outside other manifest roots', () => {
  const result = analyzeProjectSources('/tmp/project', [
    { file: 'legacy/controller.ts', content: '@Controller("test") class Test { @Get() run() {} }' },
    { file: 'web/package.json', content: '{"dependencies":{"next":"1"}}' },
    { file: 'web/app/api/route.ts', content: 'export function GET() {}' },
  ]);
  expect(result.applications).toContainEqual({ framework: 'nestjs', root: '.' });
  expect(result.routes.map(r => r.framework)).toContain('nestjs');
});
