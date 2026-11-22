import type { compareOpenApi, coverage } from '../../src/multiframework/experience';
import type { ProjectRoute } from '../../src/multiframework/project';

export interface Report {
  coverage: ReturnType<typeof coverage>;
  drift: ReturnType<typeof compareOpenApi> | null;
  openApiFile?: string;
}

export const driftLabels: Record<string, string> = {
  ambiguous: 'Ambiguous match',
  contract_only: 'Only in contract',
  code_only: 'Only in code',
  method_mismatch: 'Method differs',
  expectation_review: 'Policy expectation requires review',
  security_review: 'Contract security requires review',
};

export function evidenceLabel(entry: Report['coverage']['entries'][number]) {
  if (!entry.configured) return 'Not configured';
  if (entry.evidence === 'observed') return 'Declarations observed';
  if (entry.evidence === 'review') return 'Review required';
  return 'Evidence unknown';
}

function escape(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
function endpoint(route: { method: string; path: string | null }) {
  return escape(`${route.method} ${route.path ?? 'Unresolved path'}`);
}
function location(source: { file: string; line: number | null }) {
  return escape(source.line == null ? source.file : `${source.file}:${source.line}`);
}
function evidence(route: ProjectRoute) {
  return `<strong>${endpoint(route)}</strong><br>${escape(route.application)} · ${escape(route.framework)} · <code>${location(route.source)}</code>
    ${route.declarations.length ? `<ul>${route.declarations.map(item => `<li><code>${escape(item.expression ?? 'Unresolved expression')}</code> · ${location(item.source)}</li>`).join('')}</ul>` : '<p>No declarations observed.</p>'}`;
}
function table(heading: string[], rows: string[]) {
  return `<table><thead><tr>${heading.map(label => `<th scope="col">${escape(label)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}
export function coverageHTML(report: Report) {
  const { entries, unmatchedPolicies, disclaimer } = report.coverage;
  const routeRows = entries.map(entry => `<tr><th scope="row">${endpoint(entry.route)}<small>${escape(entry.route.application)} · ${escape(entry.route.framework)}</small></th>
    <td>${evidenceLabel(entry)}${entry.evaluations.map(evaluation => `<p>${escape(evaluation.reason)}</p>
    ${evaluation.missing.length ? `<p>Not observed: ${escape(evaluation.missing.join(', '))}</p>` : ''}
    ${evaluation.evidence.map(item => `<p><code>${escape(item.expression ?? 'Unresolved expression')}</code> · ${location(item.source)}</p>`).join('')}`).join('')}</td>
    <td><code>${location(entry.route.source)}</code></td></tr>`);
  const unmatched = unmatchedPolicies.map(item => `<li><strong>${endpoint(item.policy)}</strong> · ${escape(item.policy.framework)} ·
    ${escape(item.policy.application ?? 'All applications')} · ${item.reason === 'ambiguous' ? 'Ambiguous identity' : 'Route not observed'}
    ${item.routes.map(route => `<p>${evidence(route)}</p>`).join('')}</li>`).join('');
  const drift = report.drift;
  const driftRows = drift ? [
    ...drift.findings.filter(finding => finding.kind !== 'matched').map(finding => `<tr><th scope="row">${escape(driftLabels[finding.kind] ?? finding.kind)}</th>
      <td><strong>${endpoint(finding.contract)}</strong><br>${finding.contract.unresolved ? 'Security unresolved' : finding.contract.security ? 'Security requirement declared' : 'No security requirement declared'}<br>
      <code>${location(finding.contract.source)}</code></td><td>${finding.routes.length ? finding.routes.map(route => `<div>${evidence(route)}</div>`).join('') : 'No matching route observed.'}
      ${finding.expectations?.map(item => `<p>${escape(item.profile)} · ${escape(item.access)}</p>`).join('') ?? ''}</td></tr>`),
    ...drift.codeOnly.map(route => `<tr><th scope="row">Only in code</th><td>No matching operation observed.</td><td>${evidence(route)}</td></tr>`),
  ] : [];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'">
  <title>Cress Coverage &amp; Drift</title><style>
  :root{color-scheme:light dark}body{font:15px/1.5 system-ui,sans-serif;margin:32px auto;padding:0 20px;max-width:1080px}
  h1{letter-spacing:-.04em}h2{margin-top:32px}table{width:100%;border-collapse:collapse;text-align:left}
  th,td{padding:10px 12px;border-bottom:1px solid GrayText;vertical-align:top;overflow-wrap:anywhere}
  thead{background:Canvas}small{display:block;margin-top:4px}p{margin:5px 0 10px}code{overflow-wrap:anywhere}
  .table-wrap{overflow:auto}@media print{body{margin:0}tr{break-inside:avoid}}
  </style></head><body><main><h1>Cress Coverage &amp; Drift</h1><h2>Policy Coverage</h2>
  <p>${escape(disclaimer)}</p><p>${entries.filter(entry => entry.configured).length} of ${entries.length} routes have configured policies.</p>
  ${routeRows.length ? `<div class="table-wrap">${table(['Endpoint', 'Policy evidence', 'Source'], routeRows)}</div>` : '<p>No routes found.</p>'}
  ${unmatched ? `<h3>Policies without a unique route match</h3><ul>${unmatched}</ul>` : ''}
  <h2>OpenAPI Drift</h2>${drift ? `<p><code>${escape(report.openApiFile ?? 'OpenAPI document')}</code></p>
  <p>${escape(drift.disclaimer)}</p><p>${drift.findings.filter(finding => finding.kind === 'matched').length} operations matched without review findings.</p>
  ${driftRows.length ? `<div class="table-wrap">${table(['Finding', 'Contract', 'Code and expectations'], driftRows)}</div>` : '<p>No drift findings.</p>'}` : '<p>No OpenAPI document imported.</p>'}</main></body></html>`;
}
