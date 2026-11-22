import React, { useEffect, useState } from 'react';
import type { ProjectAnalysis, ProjectRoute } from '../../src/multiframework/project';
import { coverageHTML, driftLabels, evidenceLabel, type Report } from './CoverageReport';
import { RouteDeclarations } from './Explorer';
import { applicationLabel, frameworkLabel, Badge, Empty, Limits, Modal, Source } from './UI';

type Tab = 'coverage' | 'drift';
type Entry = Report['coverage']['entries'][number];
type Finding = NonNullable<Report['drift']>['findings'][number];
type DriftRow = { kind: string; finding?: Finding; routes: ProjectRoute[] };
const categories = [
  { label: 'All routes', match: () => true },
  { label: 'With policy', match: (entry: Entry) => entry.configured },
  { label: 'Review required', match: (entry: Entry) => entry.configured && entry.evidence === 'review' },
  { label: 'Not configured', match: (entry: Entry) => !entry.configured },
  { label: 'Declarations observed', match: (entry: Entry) => entry.configured && entry.evidence === 'observed' },
  { label: 'Evidence unknown', match: (entry: Entry) => entry.configured && entry.evidence === 'unknown' },
  { label: 'Resolved identity', match: (entry: Entry) => !!entry.route.path && entry.route.method !== 'UNRESOLVED' },
  { label: 'Unresolved identity', match: (entry: Entry) => !entry.route.path || entry.route.method === 'UNRESOLVED' },
] as const;

export function Experience({ analysis, initialTab, initialCoverageFilter, inspectRoute, openMatrix }: {
  analysis: ProjectAnalysis; initialTab: Tab; initialCoverageFilter: string;
  inspectRoute: (route: ProjectRoute) => void; openMatrix: (route?: ProjectRoute) => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [report, setReport] = useState<Report>();
  const [fetching, setFetching] = useState(true);
  const [working, setWorking] = useState(false);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    setFetching(true);
    setError('');
    void window.cress.coverage(true).then(data => { if (active) setReport(data); })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (active) setFetching(false); });
    return () => { active = false; };
  }, [analysis, retry]);

  async function run(action: () => Promise<void>) {
    setWorking(true); setError(''); setNotice('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setWorking(false); }
  }

  return <>
    <div className="coverage-toolbar">
      <nav className="section-tabs" aria-label="Coverage and drift">
        <button aria-pressed={tab === 'coverage'} onClick={() => setTab('coverage')}>Policy Coverage</button>
        <button aria-pressed={tab === 'drift'} onClick={() => setTab('drift')}>OpenAPI Drift</button>
      </nav>
      {report && <div className="toolbar">
        <button disabled={working || fetching} onClick={() => void run(async () => {
          if (await window.cress.exportText(JSON.stringify(report, null, 2), 'json')) setNotice('Report exported.');
        })}>Export JSON</button>
        <button disabled={working || fetching} onClick={() => void run(async () => {
          if (await window.cress.exportText(coverageHTML(report), 'html')) setNotice('Report exported.');
        })}>Export HTML</button>
      </div>}
    </div>
    {fetching && <p role="status">Calculating policy coverage…</p>}
    {tab === 'coverage' ? <>
      <div className="coverage-toolbar"><button disabled={fetching || working} onClick={() => setRetry(retry + 1)}>Recalculate coverage</button>
        <button onClick={() => openMatrix()}>Open Access Matrix</button></div>
      {report && <PolicyCoverage report={report.coverage} initialFilter={initialCoverageFilter} inspectRoute={inspectRoute} openMatrix={openMatrix}/>}
    </> : <OpenApi report={report} busy={fetching || working} inspectRoute={inspectRoute} importFile={() => void run(async () => {
      const imported = await window.cress.importOpenApi();
      if (imported) { setReport(imported); setNotice('OpenAPI document imported.'); }
    })} openSource={async (file, line) => {
      const source = await window.cress.openApiSource();
      if (source.file !== file) throw new Error('The imported document changed. Import it again.');
      return { ...source, line };
    }}/>}
    <p role="status">{notice}</p>{error && <p role="alert" className="error">{error}</p>}
  </>;
}

function PolicyCoverage({ report, initialFilter, inspectRoute, openMatrix }: {
  report: Report['coverage']; initialFilter: string;
  inspectRoute: (route: ProjectRoute) => void; openMatrix: (route: ProjectRoute) => void;
}) {
  const [filter, setFilter] = useState(initialFilter);
  const [framework, setFramework] = useState('');
  const [application, setApplication] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Entry>();
  const matching = report.entries.filter(({ route }) => (!framework || route.framework === framework) &&
    (!application || route.application === application) &&
    `${route.method} ${route.path ?? ''} ${route.application}`.toLowerCase().includes(query.trim().toLowerCase()));
  const active = categories.find(category => category.label === filter) ?? categories[0];
  const visible = matching.filter(active.match);
  const priority = (entry: Entry) => entry.evidence === 'review' ? 0 : entry.configured ? 1 : 2;
  visible.sort((first, second) => priority(first) - priority(second));

  return <>
    <div className="summary-grid">{categories.slice(0, 4).map(category => <button className="summary-item" key={category.label}
      aria-pressed={active === category} onClick={() => setFilter(category.label)}>
      <span>{category.label}</span><strong>{matching.filter(category.match).length}</strong><span aria-hidden="true">↘</span>
    </button>)}</div>
    {report.unmatchedPolicies.length > 0 && <details className="limits">
      <summary>Policies without a unique route match ({report.unmatchedPolicies.length})</summary>
      <ul>{report.unmatchedPolicies.map((item, index) => <li key={index}>
        <strong>{item.policy.method} {item.policy.path}</strong> · {item.policy.application ? applicationLabel(item.policy.application) : 'All applications'} · {frameworkLabel(item.policy.framework)}
        <p>{item.reason === 'ambiguous' ? 'Ambiguous identity' : 'Route not observed'}</p>
        {item.routes.map((route, index) => <button key={index} onClick={() => inspectRoute(route)}><Source {...route.source}/></button>)}
      </li>)}</ul>
    </details>}
    <div className="filters">
      <input type="search" aria-label="Search coverage routes" placeholder="Search routes" value={query} onChange={event => setQuery(event.target.value)}/>
      <select aria-label="Framework filter" value={framework} onChange={event => setFramework(event.target.value)}>
        <option value="">All frameworks</option>{[...new Set(report.entries.map(entry => entry.route.framework))].map(item => <option key={item} value={item}>{frameworkLabel(item)}</option>)}</select>
      <select aria-label="Application filter" value={application} onChange={event => setApplication(event.target.value)}>
        <option value="">All applications</option>{[...new Set(report.entries.map(entry => entry.route.application))].map(item => <option key={item} value={item}>{applicationLabel(item)}</option>)}</select>
      <select aria-label="Coverage status" value={active.label} onChange={event => setFilter(event.target.value)}>
        {categories.map(category => <option key={category.label}>{category.label}</option>)}</select>
    </div>
    <div className="result-bar" role="status">{visible.length} of {report.entries.length} routes</div>
    {visible.length ? <div className="matrix-scroll coverage-table" tabIndex={0} role="region" aria-label="Policy coverage results">
      <table><thead><tr><th scope="col">Route</th><th scope="col">Policy evidence</th><th scope="col">Source</th></tr></thead>
        <tbody>{visible.map((entry, index) => <tr key={index}>
          <th scope="row"><button className="matrix-route" onClick={() => setSelected(entry)}>
            <strong title={entry.route.path ?? undefined}>{entry.route.method} {entry.route.path ?? 'Unresolved path'}</strong><small>{applicationLabel(entry.route.application)} · {frameworkLabel(entry.route.framework)}</small>
          </button></th><td><Badge tone={entry.configured && entry.evidence === 'review' ? 'attention' : 'neutral'}>{evidenceLabel(entry)}</Badge></td>
          <td><Source {...entry.route.source}/></td>
        </tr>)}</tbody></table>
    </div> : <Empty title={report.entries.length ? 'No routes match these filters' : 'No routes found'}>
      {report.entries.length > 0 && <button onClick={() => { setFilter('All routes'); setFramework(''); setApplication(''); setQuery(''); }}>Clear filters</button>}
    </Empty>}
    {selected && <Modal title={`${selected.route.method} ${selected.route.path ?? 'Unresolved path'}`} close={() => setSelected(undefined)}>
      <Badge>{evidenceLabel(selected)}</Badge><p><Source {...selected.route.source}/></p>
      {selected.evaluations.map((evaluation, index) => <div className="declaration" key={index}>
        <p>{evaluation.reason}</p>
        {evaluation.missing.length > 0 && <p>Not observed: {evaluation.missing.join(', ')}</p>}
        {evaluation.evidence.map((item, index) => <p key={index}><code>{item.expression}</code> · <Source {...item.source}/></p>)}
      </div>)}
      <div className="toolbar dialog-actions"><button onClick={() => inspectRoute(selected.route)}>Open in Explorer</button>
        <button onClick={() => openMatrix(selected.route)}>Open in Matrix</button><button onClick={() => setSelected(undefined)}>Close</button></div>
    </Modal>}
    <Limits items={[report.disclaimer]}/>
  </>;
}

function OpenApi({ report, busy, importFile, openSource, inspectRoute }: {
  report?: Report; busy: boolean; importFile: () => void; inspectRoute: (route: ProjectRoute) => void;
  openSource: (file: string, line: number) => Promise<{ file: string; text: string; line: number }>;
}) {
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState(0);
  const [source, setSource] = useState<{ file: string; text: string; line: number }>();
  const [sourceError, setSourceError] = useState('');
  const drift = report?.drift;
  const rows: DriftRow[] = drift ? [
    ...drift.findings.filter(finding => finding.kind !== 'matched').map(finding => ({ kind: finding.kind, finding, routes: finding.routes })),
    ...drift.codeOnly.map(route => ({ kind: 'code_only', routes: [route] })),
  ] : [];
  const visible = rows.filter(row => !category || row.kind === category);
  const current = visible[selected] ?? visible[0];
  const contract = current?.finding?.contract;

  return <>
    <div className="panel coverage-toolbar">
      <div>{drift ? <><Badge tone="positive">Imported</Badge> <Source file={report.openApiFile ?? 'OpenAPI document'}/></> :
        <><h2>No OpenAPI document imported</h2><p>Select a JSON or YAML contract to compare it with observed routes.</p></>}</div>
      <button className="primary" onClick={importFile} disabled={busy}>{drift ? 'Replace OpenAPI' : 'Import OpenAPI'}</button>
    </div>
    {drift && <>
      <div className="result-bar"><span role="status">{rows.length} findings · {drift.findings.filter(finding => finding.kind === 'matched').length} matched operations</span>
        {rows.length > 0 && <select aria-label="Drift category" value={category} onChange={event => { setCategory(event.target.value); setSelected(0); }}>
          <option value="">All findings</option>
          {[...new Set(rows.map(row => row.kind))].map(kind => <option key={kind} value={kind}>
            {driftLabels[kind] ?? kind} ({rows.filter(row => row.kind === kind).length})
          </option>)}
        </select>}
      </div>
      {current ? <div className="explorer review-explorer drift-explorer">
        <div className="list route-list">{visible.map((row, index) => {
          const endpoint = row.finding?.contract ?? row.routes[0]!;
          return <button className={row === current ? 'route selected' : 'route'} key={index} aria-pressed={row === current}
            onClick={() => { setSelected(index); setSourceError(''); }}><span>
            <code>{endpoint.method} {endpoint.path ?? 'Unresolved path'}</code><small>{driftLabels[row.kind] ?? row.kind}</small>
          </span></button>;
        })}</div>
        <div className="details">
          <h2>{driftLabels[current.kind] ?? current.kind}</h2>
          <div className="compare-panes">
            <div><h3>Contract</h3>{contract ? <>
              <p><code>{contract.method} {contract.path}</code></p>
              <p>{contract.unresolved ? 'Security unresolved' : contract.security ? 'Security requirement declared' : 'No security requirement declared'}</p>
              {contract.source.line == null ? <Source {...contract.source}/> :
                <button className="source-button" onClick={() => {
                  setSourceError('');
                  void openSource(contract.source.file, contract.source.line!).then(setSource)
                    .catch(error => setSourceError(error instanceof Error ? error.message : String(error)));
                }}><Source {...contract.source}/></button>}
              {sourceError && <p role="alert" className="field-error">{sourceError}</p>}
            </> : <p>No matching operation observed.</p>}</div>
            <div><h3>Code</h3>{current.routes.length ? current.routes.map((route, index) => <div className="drift-code" key={index}>
              <button className="matrix-route" onClick={() => inspectRoute(route)}>{route.method} {route.path ?? 'Unresolved path'}</button>
              <small>{applicationLabel(route.application)} · {frameworkLabel(route.framework)}</small><p><Source {...route.source}/></p>
              <RouteDeclarations route={route}/>
            </div>) : <p>No matching route observed.</p>}
              {current.finding?.expectations?.map(item => <p key={item.profile}>{item.profile} · {item.access}</p>)}</div>
          </div>
        </div>
      </div> : <Empty title={rows.length ? 'No findings in this category' : 'No drift findings'}>
        {rows.length > 0 && <button onClick={() => setCategory('')}>Show all findings</button>}
      </Empty>}
      <Limits items={[drift.disclaimer]}/>
    </>}
    {source && <Modal title="OpenAPI source" close={() => setSource(undefined)}>
      <div aria-label="OpenAPI source"><Source {...source}/><pre className="source-preview">
        {source.text.split(/\r?\n/).slice(Math.max(0, source.line - 4), source.line + 3).map((line, index) => {
          const number = Math.max(1, source.line - 3) + index;
          return `${number}${number === source.line ? ' → ' : '   '}${line}`;
        }).join('\n')}
      </pre></div><div className="toolbar dialog-actions"><button onClick={() => setSource(undefined)}>Close source</button></div>
    </Modal>}
  </>;
}
