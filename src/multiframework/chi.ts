import go from '@ast-grep/lang-go';
import { parse, registerDynamicLanguage, type SgNode } from '@ast-grep/napi';
registerDynamicLanguage({ go });

export interface ChiMiddleware { expression: string; file: string; line: number }
export interface ChiRoute { method: string; path: string; handler: string; file: string; line: number; middleware: ChiMiddleware[] }
export interface ChiResult { routes: ChiRoute[]; warnings: string[] }
type Node = SgNode;
const methods: Record<string, string> = { Get: 'GET', Post: 'POST', Put: 'PUT', Patch: 'PATCH', Delete: 'DELETE', Head: 'HEAD', Options: 'OPTIONS' };
function children(node: Node, kind: string): Node[] { return node.children().filter(child => child.kind() === kind); }
function literal(node: Node | undefined): string | null {
  if (!node) return null;
  if (node.kind() === 'raw_string_literal') return node.text().slice(1, -1);
  if (node.kind() !== 'interpreted_string_literal') return null;
  try { return JSON.parse(node.text()) as string; } catch { return null; }
}
function args(call: Node): Node[] {
  const list = children(call, 'argument_list')[0];
  return list ? list.children().filter(n => !['(', ')', ','].includes(String(n.kind()))) : [];
}
function location(node: Node, file: string): ChiMiddleware { return { expression: node.text(), file, line: node.range().start.line + 1 }; }
function join(prefix: string, suffix: string): string { return '/' + `${prefix}/${suffix}`.split('/').filter(Boolean).join('/'); }

/** Analyze direct, lexically scoped Chi registrations only. No target code is run. */
export function analyzeChiSource(file: string, source: string): ChiResult {
  const root = parse('go', source).root();
  const routes: ChiRoute[] = []; const warnings: string[] = [];
  if (root.find({ rule: { kind: 'ERROR' } })) warnings.push(`${file}: malformed Go syntax; route coverage may be incomplete.`);
  const imports = root.findAll({ rule: { kind: 'import_spec' } });
  if (!imports.some(i => i.text().includes('"github.com/go-chi/chi/v5"'))) return { routes, warnings };
  const resolvedMounts = new Set<string>();
  function scanBlock(block: Node, router: string, prefix: string, inherited: ChiMiddleware[], owner: Node, knownRouters: Set<string>, chain: Set<string>): void {
    const statements = children(block, 'statement_list')[0]; if (!statements) return;
    const active = [...inherited];
    for (const statement of statements.children()) {
      const call = children(statement, 'call_expression')[0]; if (!call) continue;
      const selector = children(call, 'selector_expression')[0]; if (!selector) continue;
      const parts = selector.children(); const target = parts[0]; const method = parts.at(-1)?.text();
      if (!target || !method) continue;
      let extra: ChiMiddleware[] = [];
      if (target.kind() === 'call_expression') {
        const withSelector = children(target, 'selector_expression')[0];
        if (!withSelector || withSelector.text() !== `${router}.With`) continue;
        extra = args(target).map(item => location(item, file));
      } else if (target.text() !== router) continue;
      const values = args(call);
      if (method === 'Use') { active.push(...values.map(item => location(item, file))); continue; }
      if (method === 'Route' || method === 'Group') {
        const segment = method === 'Route' ? literal(values[0]) : '';
        const callback = values.find(item => item.kind() === 'func_literal');
        const parameter = callback && children(callback, 'parameter_list')[0]?.find({ rule: { kind: 'parameter_declaration' } });
        const name = parameter && children(parameter, 'identifier')[0]?.text();
        const childBlock = callback && children(callback, 'block')[0];
        if (segment !== null && name && childBlock) scanBlock(childBlock, name, join(prefix, segment), [...active, ...extra], owner, knownRouters, chain);
        else warnings.push(`${file}:${call.range().start.line + 1}: dynamic ${method} registration requires review.`);
        continue;
      }
      let verb: string | undefined = methods[method]; let pathArg = values[0]; let handler = values[1];
      if (method === 'Method' || method === 'MethodFunc') { verb = literal(values[0]) ?? (values[0]?.text().match(/^http\.Method(Get|Post|Put|Patch|Delete|Head|Options)$/)?.[1]?.toUpperCase()); pathArg = values[1]; handler = values[2]; }
      if (method === 'Handle' || method === 'HandleFunc') verb = 'ANY';
      if ((method === 'Method' || method === 'MethodFunc') && !verb) { warnings.push(`${file}:${call.range().start.line + 1}: dynamic HTTP method requires review.`); continue; }
      if (verb) {
        const routePath = literal(pathArg);
        if (routePath === null || !handler) { warnings.push(`${file}:${call.range().start.line + 1}: dynamic route registration requires review.`); continue; }
        routes.push({ method: verb, path: join(prefix, routePath), handler: handler.text(), file, line: call.range().start.line + 1, middleware: [...active, ...extra] });
      } else if (method === 'Mount') {
        const mountPath = literal(values[0]); const child = values[1]?.text();
        if (mountPath !== null && child && knownRouters.has(child) && !chain.has(child)) { resolvedMounts.add(child); scanBlock(owner, child, join(prefix, mountPath), [...active, ...extra], owner, knownRouters, new Set([...chain, child])); }
        else warnings.push(`${file}:${call.range().start.line + 1}: mounted router requires review.`);
      }
    }
  }
  for (const kind of ['function_declaration', 'method_declaration']) {
    for (const fn of root.findAll({ rule: { kind } })) {
      const block = children(fn, 'block')[0]; if (!block) continue;
      resolvedMounts.clear();
      const routerNames = new Set<string>();
      const statements = children(block, 'statement_list')[0];
      for (const declaration of statements ? children(statements, 'short_var_declaration') : []) {
        const lists = children(declaration, 'expression_list');
        if (lists.length === 2 && lists[1]!.text() === 'chi.NewRouter()') routerNames.add(lists[0]!.text());
      }
      const mounted = new Set(block.findAll({ rule: { kind: 'call_expression' } }).filter(call => children(call, 'selector_expression')[0]?.children().at(-1)?.text() === 'Mount').map(call => args(call)[1]?.text()).filter((name): name is string => !!name && routerNames.has(name)));
      for (const router of routerNames) if (!mounted.has(router)) scanBlock(block, router, '', [], block, routerNames, new Set([router]));
      if ([...mounted].some(name => !resolvedMounts.has(name))) warnings.push(`${file}: mounted router cycle or unresolved entry point requires review.`);
    }
  }
  return { routes, warnings };
}
