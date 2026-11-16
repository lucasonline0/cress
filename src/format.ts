import type { AnalysisResult, RouteFinding } from './types.js';
export function formatJson(result: AnalysisResult): string { return `${JSON.stringify(result, null, 2)}\n`; }
function accessLabel(route: RouteFinding): string {
  const pieces: string[] = [];
  if (route.guards.length) pieces.push(`Guards: ${route.guards.join(', ')}`);
  if (route.roles.length) pieces.push(`Roles: ${route.roles.join(', ')}`);
  if (route.publicMarker) pieces.push('@Public marker');
  return pieces.join('; ') || 'Unknown';
}
export function formatTerminal(result: AnalysisResult): string {
  const rows = result.findings.map((route) => [route.method, route.routePath ?? '<unresolved>', accessLabel(route), route.status, `${route.source.file}:${route.source.line}`]);
  const headers = ['METHOD', 'ROUTE', 'DECLARED ACCESS', 'STATUS', 'SOURCE'];
  const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => row[index]!.length)));
  const render = (cells: string[]) => cells.map((cell, index) => cell.padEnd(widths[index]!)).join('  ').trimEnd();
  const output = ['cress — access overview', '', render(headers), render(widths.map((width) => '─'.repeat(width))), ...rows.map(render)];
  if (!rows.length) output.push('(no NestJS routes found)');
  output.push('', `${result.findings.length} route(s) in ${result.controllersFound} controller(s); ${result.scannedFiles} source file(s) scanned.`);
  output.push('Declarations are source facts; status and warnings do not establish runtime authorization.');
  for (const route of result.findings) for (const warning of route.warnings) output.push(`  ! ${route.source.file}:${route.source.line} ${warning}`);
  for (const warning of result.warnings) output.push(`  ! ${warning}`);
  return `${output.join('\n')}\n`;
}
