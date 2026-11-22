import React, { useMemo, useState } from 'react';
import type { AccessMatrix, Expectation, MatrixEntry } from '../../src/multiframework/experience';
import type { ProjectAnalysis, ProjectRoute } from '../../src/multiframework/project';
import { RouteDeclarations } from './Explorer';
import { applicationLabel, frameworkLabel, Badge, Empty, Modal, Source } from './UI';

type Edit = { kind: 'create' } | { kind: 'rename' | 'remove'; profile: string } |
  { kind: 'condition'; route: ProjectRoute; profile: string } | { kind: 'delete'; route: ProjectRoute };
const accessLabels: Record<Expectation['access'] | '', string> = { '': 'Unset', allow: 'Allow', deny: 'Deny', conditional: 'Conditional' };
function routeKey(route: Pick<ProjectRoute, 'framework' | 'application' | 'method' | 'path'>) {
  return JSON.stringify([route.framework, route.application, route.method, route.path]);
}

export function Matrix({ analysis, focusedRoute, matrix, dirty, saving, update, save, inspectRoute }: {
  analysis: ProjectAnalysis; focusedRoute?: ProjectRoute; matrix: AccessMatrix; dirty: boolean; saving: boolean;
  update: (matrix: AccessMatrix) => void; save: () => void; inspectRoute: (route: ProjectRoute) => void;
}) {
  const [selected, setSelected] = useState(focusedRoute);
  const [search, setSearch] = useState('');
  const [framework, setFramework] = useState('');
  const [application, setApplication] = useState('');
  const [managing, setManaging] = useState(false);
  const [edit, setEdit] = useState<Edit>();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [declarationDraft, setDeclarationDraft] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const instances = useMemo(() => {
    const counts = new Map<string, number>();
    for (const route of analysis.routes) {
      const key = routeKey(route);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [analysis.routes]);
  const entries = new Map(matrix.entries.map(entry => [routeKey(entry), entry]));
  const editable = (route: ProjectRoute) => !!route.path && route.method !== 'UNRESOLVED' && instances.get(routeKey(route)) === 1;
  const routes = analysis.routes.filter(route => (!framework || route.framework === framework) &&
    (!application || route.application === application) &&
    `${route.method} ${route.path ?? ''} ${route.framework} ${route.application}`.toLowerCase().includes(search.trim().toLowerCase()));

  function patch(route: ProjectRoute, changes: Partial<MatrixEntry>) {
    if (!editable(route)) return;
    const existing = entries.get(routeKey(route));
    if (!existing && changes.requiredDeclarations?.length === 0) return;
    const entry: MatrixEntry = existing ?? {
      framework: route.framework, application: route.application, method: route.method, path: route.path!,
      requiredDeclarations: [], expectations: [],
    };
    update({ ...matrix, entries: existing ? matrix.entries.map(item => item === existing ? { ...entry, ...changes } : item)
      : [...matrix.entries, { ...entry, ...changes }] });
  }

  function changeAccess(route: ProjectRoute, profile: string, access: Expectation['access'] | '', condition?: string) {
    const row = entries.get(routeKey(route));
    const expectations = row?.expectations.filter(item => item.profile !== profile) ?? [];
    if (access) expectations.push({ profile, access, ...(condition ? { condition } : {}) });
    patch(route, { expectations });
  }

  function start(next: Edit, initial = '') {
    setError(''); setValue(initial); setEdit(next);
  }

  function apply() {
    if (!edit) return;
    const name = value.trim();
    switch (edit.kind) {
      case 'create':
      case 'rename': {
        const old = edit.kind === 'rename' ? edit.profile : undefined;
        if (!name) { setError('Enter a profile name.'); return; }
        if (name !== old && matrix.profiles.includes(name)) { setError('A profile with this name already exists.'); return; }
        if (old === undefined) update({ ...matrix, profiles: [...matrix.profiles, name] });
        else if (old !== name) update({
          profiles: matrix.profiles.map(profile => profile === old ? name : profile),
          entries: matrix.entries.map(entry => ({ ...entry, expectations: entry.expectations.map(expectation =>
            expectation.profile === old ? { ...expectation, profile: name } : expectation) })),
        });
        setAnnouncement(old === undefined ? `Profile ${name} created.` : `Profile renamed to ${name}.`);
        break;
      }
      case 'remove':
        update({ profiles: matrix.profiles.filter(profile => profile !== edit.profile), entries: matrix.entries.map(entry =>
          ({ ...entry, expectations: entry.expectations.filter(item => item.profile !== edit.profile) })) });
        setAnnouncement(`Profile ${edit.profile} removed.`);
        break;
      case 'condition':
        if (!name) { setError('Describe the condition for allowing access.'); return; }
        changeAccess(edit.route, edit.profile, 'conditional', name);
        setAnnouncement('Condition updated.');
        break;
      case 'delete':
        update({ ...matrix, entries: matrix.entries.filter(entry => routeKey(entry) !== routeKey(edit.route)) });
        setAnnouncement('Route policy removed.');
        break;
    }
    setEdit(undefined);
  }

  const row = selected && entries.get(routeKey(selected));
  const destructive = edit?.kind === 'delete' || edit?.kind === 'remove';

  return <>
    <div className="matrix-toolbar">
      <p aria-live="polite">{dirty ? 'Unsaved changes' : 'Policies are stored in .cress.json.'}</p>
      <div className="toolbar">
        {(matrix.profiles.length > 0 || managing) && <button aria-expanded={managing} onClick={() => setManaging(!managing)}>Manage profiles</button>}
        <button className="primary" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save policies'}</button>
      </div>
    </div>
    <span className="sr-only" role="status">{announcement}</span>
    {managing && <section className="panel profile-panel"><div className="matrix-toolbar"><h2>Profiles</h2>
      <button disabled={saving} onClick={() => start({ kind: 'create' })}>Create profile</button></div>
      <ul className="data-list">{matrix.profiles.map(profile => <li className="profile-row" key={profile}><strong>{profile}</strong>
        <div className="toolbar">
          <button disabled={saving} onClick={() => start({ kind: 'rename', profile }, profile)} aria-label={`Rename ${profile}`}>Rename</button>
          <button disabled={saving} onClick={() => start({ kind: 'remove', profile })} aria-label={`Remove ${profile}`}>Remove</button>
        </div>
      </li>)}</ul>
    </section>}
    {!matrix.profiles.length ? <div className="panel"><Empty title="Create your first access profile">
      <p>Use profiles such as roles or account types to record expected access for each route.</p>
      {!managing && <button className="primary" disabled={saving} onClick={() => start({ kind: 'create' })}>Create profile</button>}
    </Empty></div> : <>
      <div className="filters">
        <input type="search" aria-label="Search matrix routes" placeholder="Search routes" value={search} onChange={event => setSearch(event.target.value)}/>
        <select aria-label="Matrix framework" value={framework} onChange={event => setFramework(event.target.value)}>
          <option value="">All frameworks</option>{[...new Set(analysis.routes.map(route => route.framework))].map(item => <option key={item} value={item}>{frameworkLabel(item)}</option>)}</select>
        <select aria-label="Matrix application" value={application} onChange={event => setApplication(event.target.value)}>
          <option value="">All applications</option>{[...new Set(analysis.routes.map(route => route.application))].map(item => <option key={item} value={item}>{applicationLabel(item)}</option>)}</select>
      </div>
      <div className="result-bar" role="status">{routes.length} of {analysis.routes.length} routes</div>
      {routes.length ? <div className="matrix-scroll" tabIndex={0} role="region" aria-label="Access expectations by route and profile">
        <table><thead><tr><th scope="col">Route</th>{matrix.profiles.map(profile => <th scope="col" key={profile}>{profile}</th>)}</tr></thead>
          <tbody>{routes.map(route => {
            const config = entries.get(routeKey(route));
            return <tr key={JSON.stringify([routeKey(route), route.source])} className={route === selected ? 'matrix-selected' : undefined}>
              <th scope="row"><button className="matrix-route" aria-pressed={route === selected} onClick={() => { setSelected(route); setDeclarationDraft(undefined); }}>
                <strong title={route.path ?? undefined}>{route.method} {route.path ?? 'Unresolved path'}</strong>
                <small>{applicationLabel(route.application)} · {frameworkLabel(route.framework)}</small>
              </button>{!editable(route) && <Badge tone="attention">{!route.path || route.method === 'UNRESOLVED' ? 'Unresolved' : 'Ambiguous identity'}</Badge>}</th>
              {matrix.profiles.map(profile => {
                const item = config?.expectations.find(expectation => expectation.profile === profile);
                return <td key={profile}>
                  <select className="access-cell" value={item?.access ?? ''} disabled={saving || !editable(route)}
                    aria-label={`${profile} ${route.method} ${route.path ?? 'Unresolved'} ${route.application}`}
                    onChange={event => {
                      const access = event.target.value as Expectation['access'] | '';
                      if (access === 'conditional') start({ kind: 'condition', route, profile }, item?.condition);
                      else changeAccess(route, profile, access);
                    }}>
                    {Object.entries(accessLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  {item?.access === 'conditional' && <button className="condition-button" disabled={saving || !editable(route)}
                    title={item.condition} onClick={() => start({ kind: 'condition', route, profile }, item.condition)}>Edit condition</button>}
                </td>;
              })}
            </tr>;
          })}</tbody>
        </table>
      </div> : <Empty title="No routes match these filters"><button onClick={() => { setSearch(''); setApplication(''); setFramework(''); }}>Clear filters</button></Empty>}
    </>}
    {selected && <section className="panel matrix-detail">
      <div className="matrix-toolbar"><div><h2>{selected.method} {selected.path ?? 'Unresolved path'}</h2><Source {...selected.source}/></div>
        <button disabled={saving} onClick={() => inspectRoute(selected)}>Open in Explorer</button></div>
      <label className="field">Expected declarations
        <input value={declarationDraft ?? row?.requiredDeclarations.join(', ') ?? ''} onChange={event => setDeclarationDraft(event.target.value)} disabled={saving || !editable(selected)}
          aria-describedby="matrix-hint" onBlur={event => {
            const declarations = event.target.value.split(',').map(item => item.trim()).filter(Boolean);
            setDeclarationDraft(undefined);
            if (JSON.stringify(declarations) !== JSON.stringify(row?.requiredDeclarations ?? [])) patch(selected, { requiredDeclarations: declarations });
          }}/>
        <small id="matrix-hint">Separate source expressions with commas. Changes apply when you leave the field.</small>
      </label>
      <h3>Source evidence</h3><RouteDeclarations route={selected}/>
      {row && editable(selected) && <button className="danger-button" disabled={saving} onClick={() => start({ kind: 'delete', route: selected })}>Delete route policy</button>}
    </section>}
    {edit && <Modal title={{ create: 'Create profile', rename: 'Rename profile', remove: 'Remove profile?', condition: 'Edit access condition', delete: 'Delete route policy?' }[edit.kind]} close={() => setEdit(undefined)}>
      <form onSubmit={event => { event.preventDefault(); apply(); }}>
        {destructive ? <p>{edit.kind === 'remove' ? `Remove ${edit.profile} and its access expectations from all routes?` : 'Remove this route’s access expectations and expected declarations?'}</p>
          : <label className="field">{edit.kind === 'condition' ? 'Access condition' : 'Profile name'}
            <input value={value} onChange={event => setValue(event.target.value)} maxLength={edit.kind === 'condition' ? undefined : 100}
              aria-invalid={!!error} aria-describedby={error ? 'matrix-dialog-error' : undefined} autoFocus/>
          </label>}
        {error && <p className="field-error" role="alert" id="matrix-dialog-error">{error}</p>}
        <div className="toolbar dialog-actions"><button type="button" autoFocus={destructive} onClick={() => setEdit(undefined)}>Cancel</button>
          <button className={destructive ? 'danger-button' : 'primary'}>{edit.kind === 'create' ? 'Create profile' : edit.kind === 'remove' ? 'Remove profile' : edit.kind === 'delete' ? 'Delete policy' : 'Apply'}</button></div>
      </form>
    </Modal>}
  </>;
}
