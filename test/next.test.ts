import { describe, it, expect } from 'vitest';
import { analyzeNextSource } from '../src/multiframework/next.js';

describe('Next.js API syntax observations', () => {
  it('discovers App Router exports with dynamic paths and observations', () => {
    const result = analyzeNextSource('app/api/(internal)/users/[id]/route.ts', 'export async function GET() { const s = await auth(); return s }\nexport const POST = () => null;');
    expect(result.routes.map(r => [r.method, r.path])).toEqual([['GET', '/api/users/[id]'], ['POST', '/api/users/[id]']]);
    expect(result.routes[0]?.observations[0]?.expression).toBe('auth()');
  });
  it('marks Pages Router methods unresolved and ignores normal pages', () => {
    expect(analyzeNextSource('pages/api/users/index.ts', 'export default function handler() {}').routes[0]?.method).toBe('UNRESOLVED');
    expect(analyzeNextSource('app/users/page.tsx', 'export function GET() {}').routes).toHaveLength(0);
  });
});

it('observes middleware matchers without asserting coverage', async () => {
  const { analyzeNextMiddleware } = await import('../src/multiframework/next.js');
  const observations = analyzeNextMiddleware('src/middleware.ts', 'export const config = { matcher: ["/api/:path*"] }; export function middleware(){ return auth() }');
  expect(observations.map(o => o.expression)).toEqual(['matcher: ["/api/:path*"]', 'auth()']);
});

it('identifies explicit method cases only with a rejecting default', () => {
  const source = `export default function handler(req,res) { switch(req.method) { case 'GET': return res.end(); case 'POST': return res.end(); default: return res.status(405).end(); } }`;
  expect(analyzeNextSource('pages/api/items.ts', source).routes.map(r => r.method)).toEqual(['GET', 'POST']);
  expect(analyzeNextSource('pages/api/items.ts', source.replace('return res.status(405).end();', 'return res.end();')).routes[0]?.method).toBe('UNRESOLVED');
});
