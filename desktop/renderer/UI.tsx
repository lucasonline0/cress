import React, { type ReactNode } from 'react';

export const pages = {
  overview: 'Overview',
  routes: 'Access Explorer',
  changes: 'Authorization Review',
  matrix: 'Access Matrix',
  studio: 'Test Studio',
  coverage: 'Coverage & Drift',
} as const;
export type View = keyof typeof pages;

const iconPaths: Record<View | 'sidebar' | 'folder', string> = {
  overview: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
  routes: 'M6 5h15M6 12h15M6 19h15M3 5h.01M3 12h.01M3 19h.01',
  changes: 'M6 17V7a2 2 0 1 0 0-4 2 2 0 0 0 0 4m0 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4m0-2c0-5 12-1 12-8m0 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  matrix: 'M3 4h18v16H3zm0 5h18M9 9v11m6-11v11M3 15h18',
  studio: 'm8 6-5 6 5 6m8-12 5 6-5 6m-2-15-4 18',
  coverage: 'M4 4v16h16M9 15v-3m5 3V8m5 7V5',
  sidebar: 'M3 4h18v16H3zm6 0v16',
  folder: 'M3 19V5h7l2 3h9v11z',
};

export function Icon({ name }: { name: keyof typeof iconPaths }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[name]}/></svg>;
}

export function PageHeader({ view, actions }: { view: View; actions?: ReactNode }) {
  return <header className="page-header"><h1>{pages[view]}</h1>{actions && <div className="toolbar">{actions}</div>}</header>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><h2>{title}</h2>{children}</div>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'attention' | 'positive' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Source({ file, line }: { file: string; line?: number | null }) {
  return <code className="source">{file}{line != null && `:${line}`}</code>;
}

export function Limits({ items }: { items: string[] }) {
  const distinct = [...new Set(items)];
  return distinct.length > 0 && <details className="limits"><summary>Analysis limits ({distinct.length})</summary>
    <ul>{distinct.map(item => <li key={item}>{item}</li>)}</ul>
  </details>;
}

export function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const label = React.useId();
  React.useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="dialog" aria-labelledby={label} onCancel={event => { event.preventDefault(); close(); }}>
    <h2 id={label}>{title}</h2>{children}
  </dialog>;
}
