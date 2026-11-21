import { it, expect } from 'vitest';
import { compareObservedRoutes } from '../src/multiframework/compare.js';
import type { ObservedRoute } from '../src/multiframework/scan.js';

it('keeps applications separate and reports changed declarations without access claims', () => {
  const route: ObservedRoute = { application: 'api', framework: 'go-chi', method: 'GET', path: '/x', handler: 'h', source: { file: 'api/main.go', line: 1 }, declarations: [{ expression: 'auth', source: { file: 'api/main.go', line: 1 }, semantics: 'UNKNOWN' }] };
  const other = { ...route, application: 'api2' };
  const changed = { ...route, declarations: [] };
  expect(compareObservedRoutes([route, other], [changed, other]).map(c => c.type)).toEqual(['DECLARATION_REMOVED']);
  expect(compareObservedRoutes([route, route], [changed])[0]?.type).toBe('UNRESOLVED_CHANGE');
});
