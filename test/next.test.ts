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
