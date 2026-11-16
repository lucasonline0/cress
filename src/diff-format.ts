import type { AuthorizationChange, DiffResult } from './types.js';

export function formatDiffJson(result: DiffResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}
function routeLabel(change: AuthorizationChange): string {
  if (!change.route) return change.routeId;
  return `${change.route.method} ${change.route.path ?? '<unresolved path>'}`;
}
export function formatDiffTerminal(result: DiffResult): string {
  const lines = ['cress — authorization changes', '', `${result.changes.length} change(s) against ${result.base}`];
  if (!result.changes.length) lines.push('No supported route or authorization declaration changes found.');
  for (const change of result.changes) {
    lines.push('', `${change.type}  ${routeLabel(change)}`);
    if (change.declarationKind) lines.push(`Declaration: ${change.declarationKind}`);
    if (change.before) lines.push(`Before: ${change.before.expression ?? '(no declaration)'}  [${change.before.source.file}:${change.before.source.line}]`);
    if (change.after) lines.push(`After:  ${change.after.expression ?? '(no declaration)'}  [${change.after.source.file}:${change.after.source.line}]`);
    lines.push(`Review: ${change.review}`);
  }
  if (result.warnings.length) {
    lines.push('', 'Limitations and scan notes:');
    for (const warning of result.warnings) lines.push(`  ! ${warning}`);
  }
  lines.push('', 'Changes describe source declarations; effective access and vulnerability are not determined.');
  return `${lines.join('\n')}\n`;
}
