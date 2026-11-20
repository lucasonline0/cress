import { describe, it, expect } from 'vitest';
import { analyzeChiSource } from '../src/multiframework/chi.js';

describe('Chi syntax observations', () => {
  it('preserves nested prefixes and scoped middleware in source order', () => {
    const source = `package main
import "github.com/go-chi/chi/v5"
func routes() {
 mux := chi.NewRouter()
 mux.Use(common)
 mux.Route("/v1", func(r chi.Router) {
  r.Get("/health", app.Health)
  r.Group(func(p chi.Router) {
   p.Use(app.requireAuth)
   p.With(app.capability).Post("/users", app.Create)
  })
 })
}`;
    const result = analyzeChiSource('routes.go', source);
    expect(result.routes.map(r => [r.method, r.path])).toEqual([['GET', '/v1/health'], ['POST', '/v1/users']]);
    expect(result.routes[0]?.middleware.map(m => m.expression)).toEqual(['common']);
    expect(result.routes[1]?.middleware.map(m => m.expression)).toEqual(['common', 'app.requireAuth', 'app.capability']);
    expect(result.routes[1]?.line).toBe(10);
  });
  it('does not invent dynamic paths', () => {
    const source = 'package main\nimport "github.com/go-chi/chi/v5"\nfunc f(){r:=chi.NewRouter();r.Get(variable, handler)}';
    const result = analyzeChiSource('routes.go', source);
    expect(result.routes).toHaveLength(0); expect(result.warnings).toHaveLength(1);
  });
});

it('does not inherit middleware across unrelated routers and reports dynamic methods', () => {
  const source = `package main
import "github.com/go-chi/chi/v5"
func f() {
 a:=chi.NewRouter()
 b:=chi.NewRouter()
 a.Use(first)
 b.Use(second)
 a.Get("/one",handler)
 b.Method(variable,"/two",handler)
 b.With(extra).Post("/three",handler)
}`;
  const result = analyzeChiSource('routes.go', source);
  expect(result.routes.map(r => [r.path, r.middleware.map(m => m.expression)])).toEqual([['/one', ['first']], ['/three', ['second', 'extra']]]);
  expect(result.warnings.some(w => w.includes('dynamic HTTP method'))).toBe(true);
});

it('resolves a named router mounted in the same function', () => {
  const source = `package main
import "github.com/go-chi/chi/v5"
func f() {
 parent:=chi.NewRouter()
 child:=chi.NewRouter()
 parent.Use(parentGuard)
 child.Use(childGuard)
 child.Get("/items",handler)
 parent.Mount("/v1",child)
}`;
  const result = analyzeChiSource('routes.go', source);
  expect(result.routes.map(r => [r.path, r.middleware.map(m => m.expression)])).toEqual([['/v1/items', ['parentGuard', 'childGuard']]]);
});
