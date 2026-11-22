import React, { useState } from 'react';
import type { ProjectAnalysis, ProjectRoute } from '../../src/multiframework/project';
import { applicationLabel, frameworkLabel, Badge, Empty, Limits, Source, type View } from './UI';

export interface RouteFilters { query: string; framework: string; application: string; method: string; status: string }
export const emptyFilters: RouteFilters = { query: '', framework: '', application: '', method: '', status: '' };

const states: Record<ProjectRoute['status'], string> = {
  DECLARED: 'Declarations observed',
  UNRESOLVED: 'Unresolved',
  REQUIRES_REVIEW: 'Review required',
};

export function RouteDeclarations({ route }: { route: ProjectRoute }) {
  return route.declarations.length ? <ul className="data-list">{route.declarations.map((declaration, index) => <li className="evidence" key={index}>
    <strong>{declaration.kind === 'middleware' ? 'Middleware' : declaration.kind}</strong>
    <small>{declaration.scope} · {declaration.semantics === 'OBSERVED' ? 'Observed' : 'Unknown semantics'}</small>
    <code>{declaration.expression ?? 'Unresolved expression'}</code>
    <Source {...declaration.source}/>
  </li>)}</ul> : <p>No local declarations observed.</p>;
}

export function Explorer({ analysis, initialFilters, initialRoute, handoff }: {
  analysis: ProjectAnalysis; initialFilters: RouteFilters; initialRoute?: ProjectRoute;
  handoff: (view: Extract<View, 'matrix' | 'studio'>, route: ProjectRoute) => void;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [picked, setPicked] = useState(initialRoute);
  const query = filters.query.trim().toLowerCase();
  const routes = analysis.routes.filter(route =>
    (!filters.framework || route.framework === filters.framework) &&
    (!filters.application || route.application === filters.application) &&
    (!filters.method || route.method === filters.method) &&
    (!filters.status || (filters.status === 'identity' ? !route.path || route.method === 'UNRESOLVED' : route.status === filters.status)) &&
    `${route.method} ${route.path ?? ''} ${route.framework} ${route.application} ${route.handler}`.toLowerCase().includes(query));
  const selected = picked && routes.includes(picked) ? picked : undefined;
  const facets = [
    { key: 'framework', label: 'Framework', all: 'All frameworks' },
    { key: 'application', label: 'Application', all: 'All applications' },
    { key: 'method', label: 'HTTP method', all: 'All methods' },
  ] as const;
  const active = Object.values(filters).some(Boolean);

  return <>
    <div className="filters">
      <input type="search" aria-label="Search routes" placeholder="Search paths, methods or handlers" value={filters.query}
        onChange={event => setFilters({ ...filters, query: event.target.value })}/>
      {facets.map(({ key, label, all }) => <select key={key} aria-label={label} value={filters[key]}
        onChange={event => { setFilters({ ...filters, [key]: event.target.value }); setPicked(undefined); }}>
        <option value="">{all}</option>
        {[...new Set(analysis.routes.map(route => route[key]))].sort().map(value => <option key={value} value={value}>{key === 'framework' ? frameworkLabel(value) : key === 'application' ? applicationLabel(value) : value}</option>)}
      </select>)}
      <select aria-label="Analysis status" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}>
        <option value="">All analysis states</option><option value="identity">Unresolved identity</option>
        {Object.entries(states).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    <div className="result-bar"><span role="status">{routes.length} of {analysis.routes.length} routes</span>
      {active && <div className="applied-filters">
        {facets.map(({ key }) => filters[key] && <Badge key={key}>{key === 'framework' ? frameworkLabel(filters[key]) : key === 'application' ? applicationLabel(filters[key]) : filters[key]}</Badge>)}
        {filters.status && <Badge>{filters.status === 'identity' ? 'Unresolved identity' : states[filters.status as ProjectRoute['status']]}</Badge>}
        {query && <Badge>Search active</Badge>}
        <button onClick={() => setFilters(emptyFilters)}>Clear filters</button>
      </div>}</div>
    {routes.length ? <div className="explorer route-explorer">
      <div className="list route-list" aria-label="Routes" onKeyDown={event => {
        const index = routes.findIndex(route => route === picked);
        const focused = Number((event.target as HTMLElement).dataset.index);
        const from = Number.isInteger(focused) ? focused : index;
        const nextIndex = { ArrowDown: from + 1, ArrowUp: from - 1, Home: 0, End: routes.length - 1 }[event.key];
        if (nextIndex === undefined) return;
        event.preventDefault();
        const next = Math.max(0, Math.min(routes.length - 1, nextIndex));
        setPicked(routes[next]);
        event.currentTarget.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)?.focus();
      }}>
        {routes.map((route, index) => <button type="button" className={selected === route ? 'route selected' : 'route'}
          data-index={index} key={index} aria-pressed={selected === route} tabIndex={selected === route || (!selected && index === 0) ? 0 : -1}
          onClick={() => setPicked(route)}>
          <b>{route.method === 'UNRESOLVED' ? '—' : route.method}</b>
          <span><code title={route.path ?? undefined}>{route.path ?? 'Unresolved path'}</code>
            <small>{frameworkLabel(route.framework)} · {applicationLabel(route.application)}{route.status === 'UNRESOLVED' && ' · Unresolved'}</small></span>
        </button>)}
      </div>
      <div className="details route-details">{selected ? <>
        <Badge tone={selected.status === 'DECLARED' ? 'neutral' : 'attention'}>{states[selected.status]}</Badge>
        <h2>{selected.method} <code>{selected.path ?? 'Unresolved path'}</code></h2>
        <dl className="identity"><div><dt>Application</dt><dd>{applicationLabel(selected.application)} · {frameworkLabel(selected.framework)}</dd></div>
          <div><dt>Handler</dt><dd><code>{selected.handler}</code></dd></div>
          <div><dt>Source</dt><dd><Source {...selected.source}/></dd></div>
        </dl>
        <div className="toolbar">
          <button onClick={() => handoff('matrix', selected)}>Open in Matrix</button>
          <button onClick={() => handoff('studio', selected)}>Open in Test Studio</button>
        </div>
        <h3>Source declarations</h3>
        <RouteDeclarations route={selected}/>
        <Limits items={selected.warnings}/>
      </> : <Empty title="Select a route"><p>Inspect its handler and source declarations.</p></Empty>}</div>
    </div> : <Empty title={active ? 'No routes match these filters' : 'No routes found'}>
      {active && <button onClick={() => setFilters(emptyFilters)}>Clear filters</button>}
    </Empty>}
  </>;
}
