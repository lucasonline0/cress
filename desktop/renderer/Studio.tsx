import React, { useEffect, useState } from 'react';
import type { AccessMatrix, TestRunner, TestScenario } from '../../src/multiframework/experience';
import type { ProjectAnalysis, ProjectRoute } from '../../src/multiframework/project';
import { applicationLabel, frameworkLabel, Badge, Empty, Source } from './UI';

const fixtureFields = {
  userId: 'User ID',
  resourceId: 'Owned resource ID',
  otherResourceId: 'Third-party resource ID',
  organizationId: 'Organization ID',
  resourceParameter: 'Resource path parameter',
};
const accessLabels = { allow: 'Allow', deny: 'Deny', conditional: 'Conditional' };
const runnerLabels = { jest: 'Jest', vitest: 'Vitest' };
const statusError = (value: string) => value !== '' && (!/^\d+$/.test(value) || Number(value) < 100 || Number(value) > 599);

export function Studio({ analysis, focusedRoute }: { analysis: ProjectAnalysis; focusedRoute?: ProjectRoute }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(focusedRoute ? analysis.routes.indexOf(focusedRoute) : 0);
  const route = analysis.routes[index];
  const [matrix, setMatrix] = useState<AccessMatrix>();
  const [loadVersion, setLoadVersion] = useState(0);
  const [matrixError, setMatrixError] = useState('');

  useEffect(() => {
    let active = true;
    void window.cress.loadMatrix().then(data => { if (active) setMatrix(data); })
      .catch(error => { if (active) setMatrixError(formatError(error)); });
    return () => { active = false; };
  }, [loadVersion]);

  const routes = analysis.routes.map((route, index) => ({ route, index })).filter(({ route }) =>
    `${route.method} ${route.path ?? ''} ${route.application} ${route.framework}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="studio-layout">
    <section className="panel studio-endpoint">
      <h2>1. Select endpoint</h2>
      <label className="field">Find an endpoint<input type="search" value={query} onChange={event => setQuery(event.target.value)}
        placeholder="Filter by path, method or application"/></label>
      <label className="field">Endpoint
        <select value={route ? index : ''} onChange={event => setIndex(Number(event.target.value))} disabled={!routes.length && !route}>
          {!route && <option value="">Choose an endpoint</option>}
          {route && !routes.some(item => item.index === index) && <option value={index}>{routeLabel(route)}</option>}
          {routes.map(item => <option key={item.index} value={item.index}>{routeLabel(item.route)}</option>)}
        </select>
      </label>
      {query && <small role="status">{routes.length} matching endpoints</small>}
      {route && <div className="studio-route"><strong>{route.method} <code>{route.path ?? 'Unresolved path'}</code></strong>
        <small>{frameworkLabel(route.framework)} · {applicationLabel(route.application)}</small><Source {...route.source}/></div>}
    </section>
    {matrixError ? <div className="panel" role="alert"><p>{matrixError}</p><button onClick={() => {
      setMatrixError(''); setLoadVersion(loadVersion + 1);
    }}>Retry loading policies</button></div> :
      route && matrix ? <StudioTemplate key={index} analysis={analysis} route={route} index={index} matrix={matrix}/> :
        <div className="panel">{route ? <p role="status">Loading saved policies…</p> : <Empty title="No endpoints available"/>}</div>}
  </div>;
}

function routeLabel(route: ProjectRoute) {
  return `${route.method} ${route.path ?? 'Unresolved path'} · ${applicationLabel(route.application)} · ${frameworkLabel(route.framework)}`;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function StudioTemplate({ analysis, route, index, matrix }: { analysis: ProjectAnalysis; route: ProjectRoute; index: number; matrix: AccessMatrix }) {
  const go = route.framework === 'go-chi';
  const sameIdentity = (candidate: { framework: string; application: string; method: string; path: string | null }) =>
    candidate.framework === route.framework && candidate.application === route.application && candidate.method === route.method && candidate.path === route.path;
  const ambiguous = analysis.routes.filter(sameIdentity).length !== 1;
  const eligible = !!route.path && route.method !== 'UNRESOLVED' && !ambiguous;
  const scenarios = [{ profile: 'Unauthenticated', access: 'deny' as const }, ...(matrix.entries.find(sameIdentity)?.expectations ?? [])];
  const [runner, setRunner] = useState<TestRunner | ''>('');
  const [detected, setDetected] = useState<TestRunner[]>();
  const [detectionError, setDetectionError] = useState('');
  const [excluded, setExcluded] = useState<number[]>([]);
  const [statuses, setStatuses] = useState<Record<number, string>>({});
  const [ownership, setOwnership] = useState(false);
  const [ownerProfile, setOwnerProfile] = useState('');
  const [fixture, setFixture] = useState({ userId: '', resourceId: '', otherResourceId: '', organizationId: '', resourceParameter: '' });
  const [ownStatus, setOwnStatus] = useState('');
  const [otherStatus, setOtherStatus] = useState('');
  const [code, setCode] = useState<string>();
  const [working, setWorking] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const parameters = [...(route.path ?? '').matchAll(/(?:^|\/)(?::([A-Za-z0-9_]+)|\{([^/{}]+)\})(?=\/|$)/g)].map(match => match[1] ?? match[2]!);

  useEffect(() => {
    if (go || !eligible) return;
    let active = true;
    void window.cress.detectRunner(index).then(found => {
      if (!active) return;
      setDetected(found);
      if (found.length === 1) setRunner(found[0]!);
    }).catch(error => {
      if (active) { setDetected([]); setDetectionError(formatError(error)); }
    });
    return () => { active = false; };
  }, [eligible, go, index]);

  async function run(action: () => Promise<void>) {
    setError(''); setNotice('');
    try { await action(); } catch (error) { setError(formatError(error)); }
  }

  async function generate() {
    setAttempted(true);
    setError(''); setNotice('');
    const hasInvalidStatus = Object.entries(statuses).some(([key, value]) => !excluded.includes(Number(key)) && statusError(value));
    if (hasInvalidStatus || (ownership && (!ownerProfile || statusError(ownStatus) || statusError(otherStatus)))) return;
    const selected: TestScenario[] = scenarios.flatMap((scenario, index) => excluded.includes(index) ? [] :
      [{ ...scenario, ...(statuses[index] ? { expectedStatus: Number(statuses[index]) } : {}) }]);
    if (ownership) {
      const configure = (relationship: 'own' | 'other', expected: string): TestScenario => ({
        profile: ownerProfile, access: 'conditional', relationship, condition: relationship === 'own' ? 'own resource' : 'third-party resource',
        resourceParameter: fixture.resourceParameter, userId: fixture.userId, organizationId: fixture.organizationId,
        resourceId: relationship === 'own' ? fixture.resourceId : fixture.otherResourceId,
        ...(expected ? { expectedStatus: Number(expected) } : {}),
      });
      selected.push(configure('own', ownStatus), configure('other', otherStatus));
    }
    if (!selected.length) { setError('Select at least one scenario.'); return; }
    if (selected.length > 100) { setError('Select up to 100 scenarios.'); return; }
    setWorking(true);
    try { await run(async () => { setCode(await window.cress.generateTest(index, selected, runner || 'jest')); }); }
    finally { setWorking(false); }
  }

  return <>
    <div className="studio-settings">
      <section className="panel">
        <h2>2. Select scenarios</h2>
        {go ? <Badge>Go testing</Badge> : <label className="field">Test runner
          <select value={runner} disabled={!detected || !eligible || working} onChange={event => setRunner(event.target.value as TestRunner | '')}>
            <option value="">Choose a runner</option><option value="jest">Jest</option><option value="vitest">Vitest</option>
          </select>
          <small>{detectionError || (eligible && (!detected ? 'Detecting test runners…' : detected.length === 1
            ? `Detected ${runnerLabels[detected[0]!]}` : detected.length ? 'Jest and Vitest detected. Choose a runner.' : 'No runner detected. Choose one available in your project.'))}</small>
        </label>}
        <ul className="data-list scenario-list">{scenarios.map((scenario, index) => <li key={index}>
          <label className="check-label"><input type="checkbox" checked={!excluded.includes(index)}
            onChange={event => setExcluded(event.target.checked ? excluded.filter(item => item !== index) : [...excluded, index])}/>
            <span><strong>{index === 0 ? 'Unauthenticated request' : scenario.profile}</strong>
              <small>{index === 0 ? 'A request without credentials' : `Saved expectation: ${accessLabels[scenario.access]}`}</small>
              {'condition' in scenario && scenario.condition && <small>{scenario.condition}</small>}
            </span>
          </label>
        </li>)}</ul>
        <label className="check-label"><input type="checkbox" checked={ownership} onChange={event => setOwnership(event.target.checked)}/>
          <span><strong>Own and third-party resources</strong><small>Generate two scenarios for a selected profile.</small></span>
        </label>
      </section>
      <section className="panel studio-fixtures">
        <h2>3. Set expectations and fixtures</h2>
        <p>Leave unknown HTTP statuses blank to generate TODOs.</p>
        {scenarios.map((scenario, index) => !excluded.includes(index) && <StatusField key={index}
          label={`Expected status · ${index === 0 ? 'Unauthenticated request' : scenario.profile}`}
          value={statuses[index] ?? ''} change={value => setStatuses({ ...statuses, [index]: value })}/>)}
        {ownership && <div className="fixture-fields">
          <label className="field">Resource scenario profile
            <select value={ownerProfile} onChange={event => setOwnerProfile(event.target.value)}
              aria-invalid={attempted && !ownerProfile} aria-describedby={attempted && !ownerProfile ? 'owner-error' : undefined}>
              <option value="">Choose a profile</option>{matrix.profiles.map(profile => <option key={profile}>{profile}</option>)}
            </select>
            {!matrix.profiles.length && <small>Create and save a profile in Access Matrix to use resource scenarios.</small>}
            {attempted && !ownerProfile && <small id="owner-error" className="field-error">Choose a profile for these scenarios.</small>}
          </label>
          {(Object.keys(fixtureFields) as Array<keyof typeof fixtureFields>).map(key => <label className="field" key={key}>
            {fixtureFields[key]}<input value={fixture[key]} maxLength={500} onChange={event => setFixture({ ...fixture, [key]: event.target.value })}/>
            {key === 'resourceParameter' && parameters.length > 0 && <small>Path parameters: {parameters.join(', ')}</small>}
          </label>)}
          <StatusField label="Expected status · owned resource" value={ownStatus} change={setOwnStatus}/>
          <StatusField label="Expected status · third-party resource" value={otherStatus} change={setOtherStatus}/>
        </div>}
        {!eligible && <p>{ambiguous ? 'This endpoint has an ambiguous identity.' : 'This endpoint has an unresolved identity.'}</p>}
        <button className="primary" disabled={working || !eligible || (!go && (!detected || !runner))}
          onClick={() => void generate()}>{working ? 'Generating…' : 'Generate template'}</button>
        {error && <p role="alert" className="field-error">{error}</p>}
      </section>
    </div>
    <section className="panel studio-preview">
      <div className="matrix-toolbar"><h2>Code preview</h2><Badge>Template · not run</Badge></div>
      {code === undefined ? <Empty title="No template generated"><p>Generate a template to review and edit it here.</p></Empty> : <>
        <label className="sr-only" htmlFor="generated-code">Generated test code</label>
        <textarea id="generated-code" rows={24} value={code} spellCheck={false} autoCapitalize="off" autoComplete="off"
          onChange={event => setCode(event.target.value)}/>
        <p>Complete the test harness, credentials and fixtures before running this template.</p>
        <div className="toolbar"><button onClick={() => void run(async () => {
          await navigator.clipboard.writeText(code); setNotice('Template copied.');
        })}>Copy</button><button onClick={() => void run(async () => {
          if (await window.cress.exportText(code, go ? 'go' : 'ts')) setNotice('Template exported.');
        })}>Export</button></div>
        <p role="status">{notice}</p>
      </>}
    </section>
  </>;
}

function StatusField({ label, value, change }: { label: string; value: string; change: (value: string) => void }) {
  const id = React.useId();
  const invalid = statusError(value);
  return <label className="field status-field">{label}
    <input inputMode="numeric" value={value} onChange={event => change(event.target.value)} placeholder="Optional"
      aria-invalid={invalid} aria-describedby={invalid ? id : undefined}/>
    {invalid && <small id={id} className="field-error">Enter a whole number from 100 to 599.</small>}
  </label>;
}
