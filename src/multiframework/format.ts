import type { ProjectAnalysis } from './project.js';
import type { ProjectDiff } from './project-diff.js';

export function formatProject(analysis: ProjectAnalysis): string {
  const lines = ['cress — access overview', '', `Applications: ${analysis.applications.map(a => `${a.framework} (${a.root})`).join(', ') || 'none detected'}`, ''];
  if (!analysis.routes.length) lines.push('No API routes recognized.');
  for (const route of analysis.routes) {
    lines.push(`${route.method} ${route.path ?? '<unresolved>'}  ${route.framework} ${route.application}  ${route.status}  ${route.source.file}:${route.source.line}`);
    for (const declaration of route.declarations) lines.push(`  ${declaration.scope} ${declaration.kind}: ${declaration.expression ?? '<unresolved>'} [${declaration.source.file}:${declaration.source.line}]`);
  }
  for (const item of analysis.globalDeclarations) lines.push(`Global ${item.framework} ${item.application}: ${item.declaration.expression} [${item.declaration.source.file}:${item.declaration.source.line}]`);
  lines.push('', ...analysis.warnings.map(w => `  ! ${w}`), '', 'Source declarations do not establish runtime access.');
  return `${lines.join('\n')}\n`;
}
export function formatProjectDiff(diff: ProjectDiff): string {
  const lines = ['cress — authorization changes', '', `${diff.changes.length} change(s) against ${diff.base}`];
  if (!diff.changes.length) lines.push('No supported changes recognized.');
  for (const change of diff.changes) {
    lines.push('', `${change.type} ${change.framework} ${change.application} ${change.method} ${change.path ?? '<unresolved>'}`);
    if (change.before) lines.push(`Before: ${change.before.expression ?? '<unresolved>'} [${change.before.source.file}:${change.before.source.line}]`);
    if (change.after) lines.push(`After: ${change.after.expression ?? '<unresolved>'} [${change.after.source.file}:${change.after.source.line}]`);
    lines.push(`Review: ${change.review}`);
  }
  lines.push('', ...diff.warnings.map(w => `  ! ${w}`));
  return `${lines.join('\n')}\n`;
}
