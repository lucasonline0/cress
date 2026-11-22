import React, { useEffect, useState, type FormEvent } from 'react';
import type { ProjectChange, ProjectDiff } from '../../src/multiframework/project-diff';
import type { PolicyResult } from '../../src/multiframework/policies';
import { Badge, Empty, Limits, Source } from './UI';

const changeLabels: Record<ProjectChange['type'], string> = {
  ROUTE_ADDED: 'Route added', ROUTE_REMOVED: 'Route removed',
  DECLARATION_ADDED: 'Declaration added', DECLARATION_REMOVED: 'Declaration removed',
  DECLARATION_MODIFIED: 'Declaration changed', UNRESOLVED_CHANGE: 'Unresolved change',
};
const policyLabels: Record<PolicyResult['status'], string> = {
  PASS: 'Declarations observed', REVIEW_REQUIRED: 'Review required', UNKNOWN: 'Evidence unknown',
};

export function Review({ diff, policies, loading, compare, exportReview, openMatrix }: {
  diff: ProjectDiff | null; policies: PolicyResult[]; loading: boolean; compare: (base: string) => Promise<void>;
  exportReview: (kind: 'diff' | 'html') => void; openMatrix: () => void;
}) {
  const [base, setBase] = useState(diff?.base ?? 'HEAD');
  const [refs, setRefs] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [policyFilter, setPolicyFilter] = useState('ALL');
  const [selected, setSelected] = useState<ProjectChange>();
  useEffect(() => {
    let active = true;
    void window.cress.gitRefs().then(found => { if (active) setRefs(found); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const groups = new Map<string, ProjectChange[]>();
  for (const change of diff?.changes ?? []) {
    if (type && type !== change.type) continue;
    const label = `${change.method} ${change.path} ${change.framework} ${change.application} ${changeLabels[change.type]} ${change.declarationKind ?? ''}`;
    if (!label.toLowerCase().includes(query.trim().toLowerCase())) continue;
    const key = JSON.stringify([change.framework, change.application, change.method, change.path]);
    const group = groups.get(key);
    if (group) group.push(change);
    else groups.set(key, [change]);
  }
  const visibleChanges = [...groups.values()].flat();
  const current = selected && visibleChanges.includes(selected) ? selected : visibleChanges[0];
  const visiblePolicies = policies.filter(policy => policyFilter === 'ALL' || policy.status === policyFilter);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!base.trim() || loading) return;
    setSelected(undefined);
    setPolicyFilter('ALL');
    setType('');
    setQuery('');
    void compare(base);
  }

  return <>
    <form className="panel compare-form" onSubmit={submit}>
      <label className="field">Git baseline
        <input list="git-refs" value={base} onChange={event => setBase(event.target.value)}
          placeholder="Branch, tag or commit" required maxLength={256} aria-describedby="baseline-hint"/>
        <small id="baseline-hint">HEAD is the currently checked-out commit.</small>
      </label>
      <datalist id="git-refs">{['HEAD', ...refs].map(ref => <option key={ref} value={ref}/>)}</datalist>
      <div><strong>Working tree</strong><p>Current files, including local edits.</p></div>
      <button className="primary" disabled={loading || !base.trim()}>{loading ? 'Comparing…' : 'Compare'}</button>
    </form>
    {diff && <>
      <section className="panel review-summary">
        <div><h2>Comparison results</h2><p><code>{diff.base}</code> → Working tree</p></div>
        <div className="summary-values"><div><strong>{diff.changes.length}</strong><span>Static changes</span></div>
          <div><strong>{policies.filter(policy => policy.status === 'REVIEW_REQUIRED').length}</strong><span>Policy checks requiring review</span></div></div>
        <div className="toolbar"><button onClick={() => exportReview('diff')}>Export JSON</button>
          <button onClick={() => exportReview('html')}>Export HTML</button></div>
      </section>
      <h2>Endpoint changes</h2>
      {diff.changes.length ? <>
        <div className="filters"><input type="search" aria-label="Search changes" placeholder="Search endpoints or changes" value={query}
          onChange={event => setQuery(event.target.value)}/>
          <select aria-label="Change type" value={type} onChange={event => setType(event.target.value)}>
            <option value="">All changes</option>
            {[...new Set(diff.changes.map(change => change.type))].map(value => <option value={value} key={value}>{changeLabels[value]}</option>)}
          </select>
        </div>
        {current ? <div className="explorer review-explorer">
          <div className="list">{[...groups.entries()].map(([key, items]) => {
            const endpoint = items[0]!;
            return <div key={key} className="review-group"><strong>{endpoint.method} {endpoint.path ?? 'Global or unresolved'}</strong>
              <small>{endpoint.framework} · {endpoint.application}</small>
              {items.map((change, index) => <button key={index} className={change === current ? 'route selected' : 'route'}
                aria-pressed={change === current} onClick={() => setSelected(change)}>
                <span>{changeLabels[change.type]}{change.declarationKind && ` · ${change.declarationKind}`}</span>
              </button>)}
            </div>;
          })}</div>
          <div className="details">
            <h2>{changeLabels[current.type]}</h2><p>{current.review}</p>
            <div className="compare-panes">{(['before', 'after'] as const).map(side => {
              const snapshot = current[side];
              return <div key={side}><h3>{side === 'before' ? 'Before · Git baseline' : 'After · Working tree'}</h3>
                <p>{snapshot ? <code>{snapshot.expression ?? 'Unresolved expression'}</code> : 'No corresponding declaration'}</p>
                {snapshot && <Source {...snapshot.source}/>}
              </div>;
            })}</div>
            {current.affectedRoutes && <><h3>Potentially affected routes</h3>{current.affectedRoutes.length
              ? <ul>{current.affectedRoutes.map((route, index) => <li key={index}>{route.method} {route.path ?? 'Unresolved'} · <Source {...route.source}/></li>)}</ul>
              : <p>No routes observed in this application.</p>}</>}
          </div>
        </div> : <Empty title="No changes match these filters"><button onClick={() => { setQuery(''); setType(''); }}>Clear filters</button></Empty>}
      </> : <Empty title="No static changes found"><p>Observed routes and declarations match this baseline.</p></Empty>}
      <section className="panel policy-results">
        <h2>Expected access policies</h2>
        {policies.length ? <>
          <select aria-label="Policy status" value={policyFilter} onChange={event => setPolicyFilter(event.target.value)}>
            <option value="ALL">All policy checks</option>
            {Object.entries(policyLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
          {visiblePolicies.length ? visiblePolicies.map((policy, index) => <div className="declaration" key={index}>
            <Badge tone={policy.status === 'REVIEW_REQUIRED' ? 'attention' : 'neutral'}>{policyLabels[policy.status]}</Badge>
            <h3>{policy.policy.method} {policy.policy.path}</h3><p>{policy.policy.framework} · {policy.reason}</p>
            {policy.missing.length > 0 && <p>Not observed: {policy.missing.join(', ')}</p>}
            {policy.route && <Source {...policy.route}/>}
            {policy.evidence.map((declaration, index) => <p key={index}><code>{declaration.expression}</code> · <Source {...declaration.source}/></p>)}
          </div>) : <Empty title="No policy checks match this filter"/>}
        </> : <Empty title="No declaration policies configured"><button onClick={openMatrix}>Open Access Matrix</button></Empty>}
      </section>
      <Limits items={['Static comparisons and policy checks cannot confirm effective access.', ...diff.warnings]}/>
    </>}
  </>;
}
