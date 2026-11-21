import { it, expect } from 'vitest';
import { createProjectReport } from '../src/multiframework/report.js';
import { analyzeProjectSources } from '../src/multiframework/project.js';
import { compareProjectAnalyses } from '../src/multiframework/project-diff.js';

it('escapes untrusted source text and has no remote assets', () => {
  const after = analyzeProjectSources('/tmp/cress', [{ file: 'package.json', content: '{"dependencies":{"next":"1"}}' }, { file: 'app/api/<script>/route.ts', content: 'export function GET() { return auth("<img onerror=alert(1)>") }' }]);
  const before = analyzeProjectSources('/tmp/cress', []);
  const html = createProjectReport({ before, after, diff: compareProjectAnalyses(before, after, 'HEAD') });
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img onerror');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toMatch(/https?:\/\//);
});
