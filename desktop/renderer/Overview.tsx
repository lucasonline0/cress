import React, { useEffect, useState } from 'react';
import type { ProjectAnalysis } from '../../src/multiframework/project';
import { Empty, Limits, Source, type View } from './UI';

export function Overview({ analysis, navigate, exportScan }: {
  analysis: ProjectAnalysis;
  navigate: (view: View, filters?: { framework?: string; application?: string; unresolved?: boolean; configured?: boolean; drift?: boolean }) => void;
  exportScan: () => void;
}) {
  const [configured, setConfigured] = useState<number>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    void window.cress.coverage().then(report => {
      if (active) setConfigured(report.coverage.entries.filter(entry => entry.configured).length);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [analysis]);

  const unresolved = analysis.routes.filter(route => !route.path || route.method === 'UNRESOLVED').length;
  const metrics = [
    { label: 'Routes found', value: analysis.routes.length, action: () => navigate('routes') },
    { label: 'Applications detected', value: analysis.applications.length, action: () => document.getElementById('applications')?.focus() },
    { label: 'Routes with policies', value: configured ?? (failed ? 'Unavailable' : '…'), action: () => navigate('coverage', { configured: true }) },
    { label: 'Unresolved identities', value: unresolved, action: () => navigate('routes', { unresolved: true }) },
  ];

  return <>
    <div className="summary-grid">{metrics.map(metric => <button className="summary-item" key={metric.label} onClick={metric.action}>
      <span>{metric.label}</span><strong>{metric.value}</strong><span aria-hidden="true">↗</span>
    </button>)}</div>
    <div className="toolbar overview-actions">
      <button onClick={() => navigate('routes')}>Explore routes</button>
      <button onClick={() => navigate('changes')}>Review Git changes</button>
      <button onClick={() => navigate('matrix')}>Manage access policies</button>
      <button onClick={() => navigate('coverage', { drift: true })}>View OpenAPI drift</button>
      <button onClick={exportScan}>Export scan JSON</button>
    </div>
    <section className="panel">
      <h2 id="applications" tabIndex={-1}>Detected applications</h2>
      <p>{analysis.scannedFiles} files considered</p>
      {analysis.applications.length === 0 ? <Empty title="No supported applications detected"/> :
        <ul className="data-list">{analysis.applications.map(app => {
          const total = analysis.routes.filter(route => route.framework === app.framework && route.application === app.root).length;
          return <li key={JSON.stringify([app.framework, app.root])}><button className="data-row"
            onClick={() => navigate('routes', { framework: app.framework, application: app.root })}>
            <strong>{app.root}</strong><span>{app.framework}</span><span>{total} {total === 1 ? 'route' : 'routes'} →</span>
          </button></li>;
        })}</ul>}
    </section>
    {analysis.globalDeclarations.length > 0 && <details className="limits"><summary>Global declarations ({analysis.globalDeclarations.length})</summary>
      <ul>{analysis.globalDeclarations.map(({ application, framework, declaration }, index) => <li key={index}>
        <strong>{declaration.kind}</strong> · {application} · {framework}<br/>
        <code>{declaration.expression ?? 'Unresolved expression'}</code> · <Source {...declaration.source}/>
      </li>)}</ul>
    </details>}
    <Limits items={analysis.warnings}/>
  </>;
}
