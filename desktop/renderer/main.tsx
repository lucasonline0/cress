import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ProjectAnalysis, ProjectRoute } from '../../src/multiframework/project';
import type { PolicyResult } from '../../src/multiframework/policies';
import type { ProjectDiff, ProjectChange } from '../../src/multiframework/project-diff';
import './style.css';
import { Icon, Limits, PageHeader, pages, type View } from './UI';
import { Overview } from './Overview';
import { Experience, type Report } from './Experience';
import type { AccessMatrix, TestScenario, TestRunner } from '../../src/multiframework/experience';

interface UpdateInfo { currentVersion: string; latestVersion?: string; available: boolean; supported: boolean; message?: string }
type UpdatePhase = 'checking' | 'downloading' | 'verifying' | 'installing' | 'restarting';
interface UpdateProgress { phase: UpdatePhase; receivedBytes?: number; totalBytes?: number | null; percent?: number | null }
declare global { interface Window { cress: { loadMatrix(): Promise<AccessMatrix>; saveMatrix(matrix: AccessMatrix): Promise<AccessMatrix>; coverage(): Promise<Report>; importOpenApi(): Promise<Report | null>; openApiSource(): Promise<{file: string; text: string}>; detectRunner(index: number): Promise<TestRunner[]>; generateTest(index: number, scenarios: TestScenario[], runner: TestRunner): Promise<string>; exportText(content: string, extension: 'json' | 'html' | 'go' | 'ts'): Promise<boolean>; openProject(): Promise<string | null>; scan(path: string): Promise<ProjectAnalysis>; compare(base: string): Promise<{diff: ProjectDiff; policies: PolicyResult[]}>; exportResult(kind: 'scan' | 'diff' | 'html'): Promise<boolean>; checkUpdate(): Promise<UpdateInfo>; installUpdate(): Promise<{status: string}>; onUpdateProgress(callback: (progress: UpdateProgress) => void): () => void } } }
function App() {
  const [project, setProject] = useState(''); const [result, setResult] = useState<ProjectAnalysis | null>(null);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [query, setQuery] = useState('');
  const [method, setMethod] = useState('ALL'); const [status, setStatus] = useState('ALL'); const [selected, setSelected] = useState<ProjectRoute | null>(null);
  const [framework, setFramework] = useState('ALL'); const [application, setApplication] = useState('ALL');
  const [view, setView] = useState<View>('overview');
  const [collapsed, setCollapsed] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 860px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)');
    const resize = () => { setCompact(media.matches); setCollapsed(false); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);;
  const [base, setBase] = useState('HEAD'); const [diff, setDiff] = useState<ProjectDiff | null>(null); const [change, setChange] = useState<ProjectChange | null>(null); const [changeType, setChangeType] = useState('ALL'); const [notice, setNotice] = useState('');
  const [policies, setPolicies] = useState<PolicyResult[]>([]); const [policyFilter, setPolicyFilter] = useState('ALL');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateWorking, setUpdateWorking] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const info = await window.cress.checkUpdate();
        if (active) setUpdateInfo(info);
      } catch { /* Offline analysis remains available and the update icon stays hidden. */ }
    };
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, 60 * 60 * 1000);
    const unsubscribe = window.cress.onUpdateProgress(progress => {
      if (active) setUpdateProgress(progress);
    });
    return () => { active = false; window.clearInterval(interval); unsubscribe(); };
  }, []);
  async function handleUpdate() {
    if (!updateInfo?.available || updateWorking) return;
    setUpdateWorking(true);
    try {
      await window.cress.installUpdate();
    } catch (error) {
      // A failed update check may happen before the main process opens its error dialog.
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdateProgress(null);
      setUpdateWorking(false);
    }
  }
  async function compare() { setLoading(true); setError(''); setDiff(null); setChange(null); try { const review = await window.cress.compare(base); setDiff(review.diff); setPolicies(review.policies); setChange(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); } }
  async function save(kind: 'scan' | 'diff' | 'html') { setError(''); setNotice(''); try { if (await window.cress.exportResult(kind)) setNotice('Export saved.'); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }
  async function scan(p: string) { setLoading(true); setError(''); try { const data = await window.cress.scan(p); setResult(data); setSelected(null); setDiff(null); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); } }
  async function open() { setError(''); try { const p = await window.cress.openProject(); if (p) { setProject(p); setResult(null); setDiff(null); setQuery(''); setFramework('ALL'); setApplication('ALL'); setMethod('ALL'); setStatus('ALL'); setChangeType('ALL'); setView('overview'); setPolicies([]); await scan(p); } } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }
  const routes = result?.routes.filter(r => (framework === 'ALL' || r.framework === framework) && (application === 'ALL' || r.application === application) && (method === 'ALL' || r.method === method) && (status === 'ALL' || r.status === status || (status === 'IDENTITY' && (!r.path || r.method === 'UNRESOLVED'))) && `${r.method} ${r.path} ${r.framework} ${r.application} ${r.handler}`.toLowerCase().includes(query.toLowerCase())) ?? [];
  const [configuredCoverage, setConfiguredCoverage] = useState(false);
  function navigate(page: View, filters: { framework?: string; application?: string; unresolved?: boolean; configured?: boolean } = {}) {
    setNotice('');
    setQuery('');
    if (page === 'routes') {
      setFramework(filters.framework ?? 'ALL');
      setApplication(filters.application ?? 'ALL');
      setStatus(filters.unresolved ? 'IDENTITY' : 'ALL');
      setMethod('ALL');
      setSelected(null);
    }
    if (page === 'coverage') setConfiguredCoverage(Boolean(filters.configured));
    setView(page);
  }
  const rail = compact !== collapsed;
  return <div className="app">
    <aside className={rail ? 'sidebar rail' : 'sidebar'}>
      <div className="brand"><img src="./cress-black.png" alt=""/><b>cress.</b></div>
      {result && <nav aria-label="Workspace">
        {(Object.keys(pages) as View[]).map(page => <button key={page} title={pages[page]} aria-label={pages[page]}
          aria-current={view === page ? 'page' : undefined} onClick={() => navigate(page)}>
          <Icon name={page}/><span>{pages[page]}</span>
        </button>)}
      </nav>}
    </aside>
    <main>
      <div className="topbar">
        <div className="topbar-title">
          <button className="icon-button" aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!rail}
            title={rail ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(!collapsed)}><Icon name="sidebar"/></button>
          {project ? <><button className="project-button" title={project} aria-label="Switch project" disabled={loading}
            onClick={() => void open()}><Icon name="folder"/><span>{project.split(/[\\/]/).filter(Boolean).pop() ?? project}</span></button>
            <span aria-hidden="true" className="breadcrumb-divider">/</span><span>{pages[view]}</span></> : <span>Welcome</span>}
        </div>
        <div className="topbar-actions">
          {project && <button onClick={() => void scan(project)} disabled={loading}>Rescan</button>}
          <UpdateIndicator info={updateInfo} progress={updateProgress} working={updateWorking} onClick={() => void handleUpdate()}/>
        </div>
      </div>
      <div className="main-content">
        {!project && <div className="welcome"><img src="./cress-black.png" alt=""/>
          <h1>Explore authorization in your code</h1>
          <p>Open a project folder to inspect routes and access declarations on this device.</p>
          <div className="actions"><button className="primary" disabled={loading} onClick={() => void open()}>Open project</button></div>
        </div>}
        {loading && <p role="status">{view === 'changes' && result ? 'Comparing with Git baseline…' : 'Scanning project…'}</p>}
        {result && <><PageHeader view={view}/>
        {view === 'overview' && <Overview analysis={result} navigate={navigate} exportScan={() => void save('scan')}/>}{view === 'routes' && result && <><div className="filters"><input aria-label="Search routes" placeholder="Search routes" value={query} onChange={e => { setQuery(e.target.value); setSelected(null); setChange(null); }}/><select aria-label="Framework" value={framework} onChange={e => { setFramework(e.target.value); setSelected(null); }}><option value="ALL">All frameworks</option>{[...new Set(result.routes.map(r => r.framework))].sort().map(f => <option key={f}>{f}</option>)}</select><select aria-label="Application" value={application} onChange={e => { setApplication(e.target.value); setSelected(null); }}><option value="ALL">All applications</option>{[...new Set(result.routes.map(r => r.application))].sort().map(a => <option key={a}>{a}</option>)}</select><select aria-label="HTTP method" value={method} onChange={e => { setMethod(e.target.value); setSelected(null); }}><option value="ALL">All methods</option>{[...new Set(result.routes.map(r => r.method))].sort().map(m => <option key={m}>{m}</option>)}</select><select aria-label="Analysis status" value={status} onChange={e => { setStatus(e.target.value); setSelected(null); }}><option value="ALL">All statuses</option><option>DECLARED</option><option value="IDENTITY">Unresolved identity</option><option>UNRESOLVED</option><option>REQUIRES_REVIEW</option></select></div><div className="explorer"><div className="list">{routes.length ? routes.map((r, i) => <button className={selected === r ? 'route selected' : 'route'} key={i} onClick={() => setSelected(r)}><b>{r.method}</b><span>{r.path ?? 'Unresolved path'}</span><small>{r.status}</small></button>) : <p>No routes match your filters.</p>}</div><div className="details">{selected ? <><div className="eyebrow">{selected.status}</div><h2>{selected.method} {selected.path ?? 'Unresolved path'}</h2><p>{selected.framework} · {selected.application} · {selected.handler}</p><p className="path">{selected.source.file}:{selected.source.line}</p><h3>Authorization declarations</h3>{selected.declarations.length ? selected.declarations.map((d, i) => <div className="declaration" key={i}><b>{d.kind}</b> <small>{d.scope} · {d.semantics}</small><p>{d.expression ?? 'Unresolved expression'}</p><small>{d.source.file}:{d.source.line}</small></div>) : <p>No local declarations observed. Effective access is unknown.</p>}<Limits items={selected.warnings}/></> : <p>Select a route to inspect its declarations.</p>}</div></div></>}</>}{view === 'changes' && <><section className="panel"><h2>Authorization review</h2><p>Compare source declarations with a local Git reference. Effective access remains unknown.</p><div className="filters"><input aria-label="Git baseline" value={base} onChange={e => setBase(e.target.value)} placeholder="Branch, tag or commit"/><button onClick={() => void compare()} disabled={loading}>Compare</button></div></section>{diff && <><section className="panel"><h2>Expected access policies</h2><p>Missing observations do not establish that protection is absent.</p><select aria-label="Policy status" value={policyFilter} onChange={e => setPolicyFilter(e.target.value)}><option value="ALL">All policies</option><option>PASS</option><option>REVIEW_REQUIRED</option><option>UNKNOWN</option></select>{policies.length ? policies.filter(p => policyFilter === 'ALL' || p.status === policyFilter).map((p, i) => <div className="declaration" key={i}><b>{p.status} · {p.policy.method} {p.policy.path}</b><p>{p.policy.framework} · {p.reason}</p>{p.missing.length > 0 && <p>Not observed: {p.missing.join(', ')}</p>}{p.route && <small>Route: {p.route.file}:{p.route.line} </small>}{p.evidence.map((d, n) => <p key={n}>{d.expression} <small>{d.source.file}:{d.source.line}</small></p>)}</div>) : <p>No policies configured. Add a .cress.json file to the project.</p>}</section><Limits items={diff.warnings}/><div className="filters"><input aria-label="Search changes" placeholder="Search changes" value={query} onChange={e => { setQuery(e.target.value); setSelected(null); setChange(null); }}/><select aria-label="Change type" value={changeType} onChange={e => { setChangeType(e.target.value); setChange(null); }}><option value="ALL">All changes</option>{[...new Set(diff.changes.map(c => c.type))].sort().map(t => <option key={t}>{t}</option>)}</select><button onClick={() => void save('diff')}>Export JSON</button><button onClick={() => void save('html')}>Export HTML</button></div><div className="explorer"><div className="list">{(() => { const filtered = diff.changes.filter(c => (changeType === 'ALL' || c.type === changeType) && `${c.type} ${c.framework} ${c.application} ${c.method} ${c.path} ${c.declarationKind ?? ''}`.toLowerCase().includes(query.toLowerCase())); const groups = new Map<string, ProjectChange[]>(); for (const c of filtered) { const key = JSON.stringify([c.framework, c.application, c.method, c.path]); groups.set(key, [...(groups.get(key) ?? []), c]); } return groups.size ? [...groups.entries()].map(([key, items]) => <section className="panel" key={key}><b>{items[0]!.framework} · {items[0]!.application} · {items[0]!.method} {items[0]!.path ?? 'Global / unresolved'}</b>{items.map((c, i) => <button className={change === c ? 'route selected' : 'route'} key={i} onClick={() => setChange(c)}><span>{c.type} {c.declarationKind && `· ${c.declarationKind}`}</span></button>)}</section>) : <p>No changes match your filters.</p>; })()}</div><div className="details">{change ? <><h2>{change.type}</h2><p>{change.framework} · {change.application} · {change.method} {change.path}</p><p>{change.review}</p>{change.affectedRoutes && <section className="panel"><h3>Potentially affected routes</h3>{change.affectedRoutes.length ? change.affectedRoutes.map((r, i) => <p key={i}>{r.method} {r.path ?? 'Unresolved'} <small>{r.source.file}:{r.source.line}</small></p>) : <p>No routes observed in this application.</p>}</section>}{(['before', 'after'] as const).map(side => <section className="panel" key={side}><h3>{side === 'before' ? 'Before' : 'After'}</h3><p>{change[side]?.expression ?? 'No corresponding declaration'}</p>{change[side] && <small>{change[side]?.source.file}:{change[side]?.source.line}</small>}</section>)}</> : <p>Select a change to inspect its source.</p>}</div></div></>}</>}{result && (view === 'matrix' || view === 'studio' || view === 'coverage') && <Experience key={project} initialCoverageFilter={configuredCoverage ? 'With policy' : 'All routes'} view={view} analysis={result} inspectRoute={r => { setFramework(r.framework); setApplication(r.application); setMethod('ALL'); setStatus('ALL'); setQuery(''); setSelected(result.routes.find(x => x.source.file === r.source.file && x.source.line === r.source.line && x.method === r.method) ?? null); setView('routes'); }}/>} {notice && <p role="status">{notice}</p>}{error && <div role="alert" className="error">{error}</div>}</div></main></div>;
}
function UpdateIndicator({ info, progress, working, onClick }: { info: UpdateInfo | null; progress: UpdateProgress | null; working: boolean; onClick: () => void }) {
  if (progress && working) {
    const labels: Record<UpdatePhase, string> = {
      checking: 'Checking update',
      downloading: 'Downloading update',
      verifying: 'Verifying update',
      installing: 'Installing update',
      restarting: 'Restarting Cress',
    };
    const percentage = typeof progress.percent === 'number' && Number.isFinite(progress.percent) ? Math.max(0, Math.min(100, progress.percent)) : null;
    const label = labels[progress.phase] + (percentage !== null ? ': ' + percentage + '%' : '…');
    const circumference = 2 * Math.PI * 14;
    return <span className={percentage === null ? 'update-progress update-indeterminate' : 'update-progress'} role="progressbar" aria-label={label} aria-valuemin={percentage === null ? undefined : 0} aria-valuemax={percentage === null ? undefined : 100} aria-valuenow={percentage ?? undefined} aria-valuetext={label} title={label}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="update-track" cx="18" cy="18" r="14"/>
        <circle className="update-arc" cx="18" cy="18" r="14" strokeDasharray={percentage === null ? '25 63' : circumference} strokeDashoffset={percentage === null ? 0 : circumference * (1 - percentage / 100)}/>
      </svg>
    </span>;
  }
  if (!info?.available) return null;
  return <button type="button" className="update-icon" onClick={onClick} disabled={working} title={'New Cress update available: ' + info.latestVersion} aria-label={'New Cress update available: ' + info.latestVersion}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 18v2h16v-2"/></svg>
  </button>;
}
createRoot(document.getElementById('root')!).render(<App/>);
