import type { ObservedRoute } from './scan.js';

export interface ObservedChange {
  type: 'ROUTE_ADDED' | 'ROUTE_REMOVED' | 'DECLARATION_ADDED' | 'DECLARATION_REMOVED' | 'UNRESOLVED_CHANGE';
  identity: string;
  before: ObservedRoute | null;
  after: ObservedRoute | null;
  review: string;
}
function identity(route: ObservedRoute): string {
  return JSON.stringify([route.application, route.framework, route.method, route.path]);
}
/** Compare observations only; duplicate identities are deliberately not paired. */
export function compareObservedRoutes(before: ObservedRoute[], after: ObservedRoute[]): ObservedChange[] {
  const groups = (routes: ObservedRoute[]) => {
    const map = new Map<string, ObservedRoute[]>();
    for (const route of routes) { const key = identity(route); map.set(key, [...(map.get(key) ?? []), route]); }
    return map;
  };
  const old = groups(before); const current = groups(after); const changes: ObservedChange[] = [];
  for (const key of [...new Set([...old.keys(), ...current.keys()])].sort()) {
    const a = old.get(key) ?? []; const b = current.get(key) ?? [];
    const make = (type: ObservedChange['type'], review: string) => changes.push({ type, identity: key, before: a[0] ?? null, after: b[0] ?? null, review });
    if (a.length > 1 || b.length > 1) { make('UNRESOLVED_CHANGE', 'Duplicate route identity prevents reliable matching.'); continue; }
    if (!a.length) { make('ROUTE_ADDED', 'A route declaration was added; effective access is unknown.'); continue; }
    if (!b.length) { make('ROUTE_REMOVED', 'A route declaration was removed; effective access is unknown.'); continue; }
    const previous = a[0]!.declarations.map(d => d.expression); const next = b[0]!.declarations.map(d => d.expression);
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      if (previous.some(x => !next.includes(x))) make('DECLARATION_REMOVED', 'A declaration was removed or changed; effective access is unknown.');
      if (next.some(x => !previous.includes(x))) make('DECLARATION_ADDED', 'A declaration was added or changed; effective access is unknown.');
      if (previous.length === next.length && previous.every(x => next.includes(x)) && next.every(x => previous.includes(x))) make('UNRESOLVED_CHANGE', 'Declaration ordering or multiplicity changed; review the source.');
    }
  }
  return changes;
}
