import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ProjectAnalysis, ProjectRoute } from '../../src/multiframework/project';
import type { PolicyResult } from '../../src/multiframework/policies';
import type { ProjectDiff } from '../../src/multiframework/project-diff';
import './style.css';
import { Icon, Modal, PageHeader, pages, type View } from './UI';
import { Explorer, emptyFilters, type RouteFilters } from './Explorer';
import { Studio } from './Studio';
import { Matrix } from './Matrix';
import { Review } from './Review';
import { Overview } from './Overview';
import { Experience } from './Experience';
import type { Report } from './CoverageReport';
import type { AccessMatrix, TestScenario, TestRunner } from '../../src/multiframework/experience';

interface UpdateInfo { currentVersion: string; latestVersion?: string; available: boolean; supported: boolean; message?: string }
type UpdatePhase = 'checking' | 'downloading' | 'verifying' | 'installing' | 'restarting';
interface UpdateProgress { phase: UpdatePhase; receivedBytes?: number; totalBytes?: number | null; percent?: number | null }
declare global {
  interface Window {
    cress: {
      openProject(): Promise<string | null>;
      scan(path: string): Promise<ProjectAnalysis>;
      gitRefs(): Promise<string[]>;
      compare(base: string): Promise<{ diff: ProjectDiff; policies: PolicyResult[] }>;
      exportResult(kind: 'scan' | 'diff' | 'html'): Promise<boolean>;
      loadMatrix(): Promise<AccessMatrix>;
      saveMatrix(matrix: AccessMatrix): Promise<AccessMatrix>;
      detectRunner(index: number): Promise<TestRunner[]>;
      generateTest(index: number, scenarios: TestScenario[], runner: TestRunner): Promise<string>;
      coverage(includeOpenApi?: boolean): Promise<Report>;
      importOpenApi(): Promise<Report | null>;
      openApiSource(): Promise<{ file: string; text: string }>;
      exportText(content: string, extension: 'json' | 'html' | 'go' | 'ts'): Promise<boolean>;
      checkUpdate(): Promise<UpdateInfo>;
      installUpdate(): Promise<{ status: string }>;
      onUpdateProgress(callback: (progress: UpdateProgress) => void): () => void;
    };
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : String(error); }

function App() {
  const [project, setProject] = useState('');
  const [result, setResult] = useState<ProjectAnalysis | null>(null);
  const [scanVersion, setScanVersion] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const [routeFilters, setRouteFilters] = useState<RouteFilters>(emptyFilters);
  const [focusedRoute, setFocusedRoute] = useState<ProjectRoute>();
  const [view, setView] = useState<View>('overview');
  const [collapsed, setCollapsed] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 860px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 860px)');
    const resize = () => { setCompact(media.matches); setCollapsed(false); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    if (!result) return;
    const heading = contentRef.current?.querySelector('h1');
    heading?.focus({ preventScroll: true });
    contentRef.current?.parentElement?.scrollTo(0, 0);
  }, [view, result]);
  const [diff, setDiff] = useState<ProjectDiff | null>(null);
  const [notice, setNotice] = useState('');
  const [policies, setPolicies] = useState<PolicyResult[]>([]);
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
      setError(message(error));
    } finally {
      setUpdateProgress(null);
      setUpdateWorking(false);
    }
  }
  const [matrix, setMatrix] = useState<AccessMatrix>();
  const [matrixDirty, setMatrixDirty] = useState(false);
  const [matrixSaving, setMatrixSaving] = useState(false);
  const [matrixFailed, setMatrixFailed] = useState(false);
  const [switchConfirm, setSwitchConfirm] = useState(false);
  useEffect(() => {
    if (!result || scanning || view !== 'matrix' || matrix || matrixFailed) return;
    let active = true;
    void window.cress.loadMatrix().then(data => { if (active) setMatrix(data); }).catch(error => {
      if (active) { setError(message(error)); setMatrixFailed(true); }
    });
    return () => { active = false; };
  }, [result, scanning, view, matrix, matrixFailed]);

  async function saveMatrix() {
    if (!matrix || matrixSaving) return;
    setMatrixSaving(true);
    setError('');
    try {
      setMatrix(await window.cress.saveMatrix(matrix));
      setMatrixDirty(false);
      setDiff(null);
      setNotice('Policies saved to .cress.json.');
    } catch (error) { setError(message(error)); }
    finally { setMatrixSaving(false); }
  }

  async function compare(base: string) {
    setComparing(true);
    setError('');
    setNotice('');
    setDiff(null);
    try {
      const review = await window.cress.compare(base);
      setDiff(review.diff);
      setPolicies(review.policies);
    } catch (error) { setError(message(error)); }
    finally { setComparing(false); }
  }

  async function save(kind: 'scan' | 'diff' | 'html') {
    setError('');
    setNotice('');
    try { if (await window.cress.exportResult(kind)) setNotice('Export saved.'); }
    catch (error) { setError(message(error)); }
  }

  async function scan(path: string) {
    setScanning(true);
    setError('');
    setNotice('');
    try {
      setResult(await window.cress.scan(path));
      setScanVersion(version => version + 1);
      setFocusedRoute(undefined);
      setRouteFilters(emptyFilters);
      setDiff(null);
      if (!matrixDirty || path !== project) setMatrix(undefined);
      setMatrixFailed(false);
    } catch (error) { setError(message(error)); }
    finally { setScanning(false); }
  }

  async function open() {
    setOpening(true);
    setError('');
    try {
      const path = await window.cress.openProject();
      if (!path) return;
      setMatrix(undefined);
      setMatrixDirty(false);
      setMatrixFailed(false);
      setProject(path);
      setResult(null);
      setDiff(null);
      setPolicies([]);
      setView('overview');
      await scan(path);
    } catch (error) { setError(message(error)); }
    finally { setOpening(false); }
  }

  const [coverageStart, setCoverageStart] = useState({ configured: false, drift: false });
  function navigate(page: View, filters: { framework?: string; application?: string; unresolved?: boolean; configured?: boolean; drift?: boolean } = {}) {
    if (page === view) return;
    setNotice('');
    setError('');
    if (page === 'routes') {
      setRouteFilters({ ...emptyFilters, framework: filters.framework ?? '', application: filters.application ?? '', status: filters.unresolved ? 'identity' : '' });
      setFocusedRoute(undefined);
    }
    if (page === 'matrix' || page === 'studio') setFocusedRoute(undefined);
    if (page === 'coverage') setCoverageStart({ configured: Boolean(filters.configured), drift: Boolean(filters.drift) });
    setView(page);
    if (compact) setCollapsed(false);
  }
  function inspectRoute(route: ProjectRoute) {
    setError('');
    setNotice('');
    setRouteFilters(emptyFilters);
    setFocusedRoute(result?.routes.find(candidate => candidate.source.file === route.source.file &&
      candidate.source.line === route.source.line && candidate.method === route.method &&
      candidate.application === route.application && candidate.path === route.path));
    setView('routes');
  }
  const rail = compact !== collapsed;
  const busy = opening || scanning || comparing || matrixSaving;
  return <div className="app">
    {project && <aside className={rail ? 'sidebar rail' : 'sidebar'}>
      <div className="brand"><img src="./cress-black.png" alt=""/><b>cress.</b></div>
      {result && <nav id="workspace-nav" aria-label="Workspace">
        {(Object.keys(pages) as View[]).map(page => <button key={page} title={pages[page]} aria-label={pages[page]}
          disabled={busy} aria-current={view === page ? 'page' : undefined} onClick={() => navigate(page)}>
          <Icon name={page}/><span>{pages[page]}</span>
        </button>)}
      </nav>}
    </aside>}
    <main>
      <div className="topbar">
        <div className="topbar-title">
          {project && <button className="icon-button" aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!rail} aria-controls={result ? 'workspace-nav' : undefined}
            title={rail ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(!collapsed)}><Icon name="sidebar"/></button>}
          {project ? <><button className="project-button" title={`Switch project · ${project}`} aria-label="Switch project" disabled={busy}
            onClick={() => matrixDirty ? setSwitchConfirm(true) : void open()}><Icon name="folder"/><span>{project.split(/[\\/]/).filter(Boolean).pop() ?? project}</span></button>
            <span aria-hidden="true" className="breadcrumb-divider">/</span><span>{pages[view]}</span></> : <span>Welcome</span>}
        </div>
        <div className="topbar-actions">
          {project && <button onClick={() => void scan(project)} disabled={busy}>Rescan</button>}
          <UpdateIndicator info={updateInfo} progress={updateProgress} working={updateWorking} onClick={() => void handleUpdate()}/>
        </div>
      </div>
      <div className="main-content" ref={contentRef}>
        {!project && <div className="welcome"><img src="./cress-black.png" alt=""/>
          <h1>Explore authorization in your code</h1>
          <p>Open a project folder to inspect routes and access declarations on this device.</p>
          <div className="actions"><button className="primary" disabled={opening} onClick={() => void open()}>Open project</button></div>
        </div>}
        {project && !result && !scanning && error && <button className="primary" onClick={() => void scan(project)}>Retry scan</button>}
        {scanning && <p className="feedback" role="status">Scanning project…</p>}
        {error && <p role="alert" className="feedback error">{error}</p>}
        {notice && <p role="status" className="feedback success">{notice}</p>}
        {result && <div inert={scanning}>
          <PageHeader view={view}/>
          {view === 'overview' && <Overview key={scanVersion} analysis={result} navigate={navigate} exportScan={() => void save('scan')}/>}
          {view === 'routes' && <Explorer key={scanVersion} analysis={result} initialFilters={routeFilters} initialRoute={focusedRoute}
            handoff={(page, route) => { setFocusedRoute(route); setView(page); }}/>}
          {view === 'changes' && <Review diff={diff} policies={policies} loading={comparing || matrixSaving}
            compare={compare} exportReview={kind => void save(kind)} openMatrix={() => navigate('matrix')}/>}
          {view === 'matrix' && (matrix
            ? <Matrix key={scanVersion} analysis={result} matrix={matrix} focusedRoute={focusedRoute} dirty={matrixDirty} saving={matrixSaving}
              update={data => { setMatrix(data); setMatrixDirty(true); setNotice(''); }} save={() => void saveMatrix()} inspectRoute={inspectRoute}/>
            : matrixFailed ? <button onClick={() => { setError(''); setMatrixFailed(false); }}>Retry loading policies</button>
              : <p role="status">Loading policies…</p>)}
          {view === 'studio' && <Studio key={scanVersion} analysis={result} focusedRoute={focusedRoute}/>}
          {view === 'coverage' && <Experience key={scanVersion} initialCoverageFilter={coverageStart.configured ? 'With policy' : 'All routes'}
            initialTab={coverageStart.drift ? 'drift' : 'coverage'} analysis={result} inspectRoute={inspectRoute} openMatrix={route => {
              navigate('matrix'); setFocusedRoute(route);
            }}/>}
        </div>}
        {switchConfirm && <Modal title="Switch projects?" close={() => setSwitchConfirm(false)}>
          <p>This project has unsaved policy changes.</p><div className="toolbar dialog-actions">
            <button autoFocus onClick={() => setSwitchConfirm(false)}>Cancel</button>
            <button className="danger-button" onClick={() => { setSwitchConfirm(false); void open(); }}>Discard and switch</button>
          </div></Modal>}
      </div>
    </main>
  </div>;
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
