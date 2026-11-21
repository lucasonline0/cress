import go from '@ast-grep/lang-go';
import { parse, registerDynamicLanguage, type SgNode } from '@ast-grep/napi';
import path from 'node:path';
import type { ProjectFile } from './detection.js';
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
function join(prefix: string, suffix: string): string {
  if (!suffix) return prefix;
  if (!prefix || prefix === '/') return suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${prefix.endsWith('/') ? prefix.slice(0, -1) : prefix}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}

interface ChiHelper { file: string; packageId: string; router: string; block: Node }
export interface ChiHelperIndex { definitions: Map<string, ChiHelper[]>; imports: Map<string, Map<string, { directory: string; packageId: string }>> }
function packageName(root: Node): string { return root.find({ rule: { kind: 'package_clause' } })?.text() ?? ''; }
function hasBuildConstraints(file: string, content: string): boolean {
  return /^\s*\/\/\s*(?:go:build|\+build)\b/m.test(content) || /_(?:aix|android|darwin|dragonfly|freebsd|illumos|ios|js|linux|netbsd|openbsd|plan9|solaris|wasip1|windows|386|amd64|arm|arm64|loong64|mips|mips64|mips64le|mipsle|ppc64|ppc64le|riscv64|s390x|wasm)(?:_(?:386|amd64|arm|arm64|loong64|mips|mips64|mips64le|mipsle|ppc64|ppc64le|riscv64|s390x|wasm))?\.go$/.test(file);
}
function helperKey(file: string, packageId: string, name: string): string { return `${path.posix.dirname(file)}\0${packageId}\0${name}`; }
/** Index simple router-parameter functions in the local Go module; no files are executed. */
export function indexChiHelpers(files: ProjectFile[], applicationRoot = '.'): ChiHelperIndex {
  const definitions = new Map<string, ChiHelper[]>();
  const imports = new Map<string, Map<string, { directory: string; packageId: string }>>();
  const packages = new Map<string, Set<string>>();
  const parsed: Array<{ file: string; root: Node }> = [];
  const manifest = files.find(file => file.file === (applicationRoot === '.' ? 'go.mod' : `${applicationRoot}/go.mod`));
  const modulePath = manifest?.content.match(/^\s*module\s+([^\s]+)\s*$/m)?.[1];
  for (const source of files) {
    if (!source.file.endsWith('.go') || source.file.endsWith('_test.go') || hasBuildConstraints(source.file, source.content)) continue;
    let root: Node;
    try { root = parse('go', source.content).root(); } catch { continue; }
    if (root.find({ rule: { kind: 'ERROR' } })) continue;
    parsed.push({ file: source.file, root });
    const directory = path.posix.dirname(source.file); const packageId = packageName(root);
    if (packageId) packages.set(directory, new Set([...(packages.get(directory) ?? []), packageId]));
    if (!root.findAll({ rule: { kind: 'import_spec' } }).some(i => i.text().includes('"github.com/go-chi/chi/v5"'))) continue;
    for (const fn of root.findAll({ rule: { kind: 'function_declaration' } })) {
      const name = children(fn, 'identifier')[0]?.text(); const list = children(fn, 'parameter_list')[0];
      const parameters = list ? children(list, 'parameter_declaration') : [];
      const parameter = parameters[0]; const names = parameter ? children(parameter, 'identifier') : [];
      const type = parameter ? children(parameter, 'qualified_type')[0]?.text() : undefined;
      const block = children(fn, 'block')[0];
      if (!name || parameters.length !== 1 || names.length !== 1 || type !== 'chi.Router' || !block) continue;
      const key = helperKey(source.file, packageName(root), name);
      definitions.set(key, [...(definitions.get(key) ?? []), { file: source.file, packageId, router: names[0]!.text(), block }]);
    }
  }
  if (modulePath) for (const source of parsed) {
    const fileImports = new Map<string, { directory: string; packageId: string }>();
    const duplicateAliases = new Set<string>();
    for (const spec of source.root.findAll({ rule: { kind: 'import_spec' } })) {
      if (children(spec, 'blank_identifier').length || children(spec, 'dot').length) continue;
      const imported = literal(children(spec, 'interpreted_string_literal')[0]);
      if (!imported || !imported.startsWith(`${modulePath}/`)) continue;
      const relative = imported.slice(modulePath.length + 1);
      if (!relative || relative.split('/').some(part => !part || part === '.' || part === '..') || relative.includes('\\')) continue;
      const directory = path.posix.join(applicationRoot, relative);
      const packageIds = [...(packages.get(directory) ?? [])];
      if (packageIds.length !== 1) continue;
      const alias = children(spec, 'package_identifier')[0]?.text() ?? packageIds[0]!.replace(/^package\s+/, '');
      if (fileImports.has(alias)) { duplicateAliases.add(alias); continue; }
      fileImports.set(alias, { directory, packageId: packageIds[0]! });
    }
    for (const alias of duplicateAliases) fileImports.delete(alias);
    imports.set(source.file, fileImports);
  }
  return { definitions, imports };
}

/** Analyze direct, lexically scoped Chi registrations only. No target code is run. */
export function analyzeChiSource(file: string, source: string, helpers: ChiHelperIndex = { definitions: new Map(), imports: new Map() }): ChiResult {
  const root = parse('go', source).root();
  const routes: ChiRoute[] = []; const warnings: string[] = [];
  if (root.find({ rule: { kind: 'ERROR' } })) warnings.push(`${file}: malformed Go syntax; route coverage may be incomplete.`);
  if (hasBuildConstraints(file, source)) warnings.push(`${file}: Go build constraints are not evaluated.`);
  const imports = root.findAll({ rule: { kind: 'import_spec' } });
  if (!imports.some(i => i.text().includes('"github.com/go-chi/chi/v5"'))) return { routes, warnings };
  const resolvedMounts = new Set<string>();
  const packageId = packageName(root);
  function scanBlock(block: Node, router: string, prefix: string, inherited: ChiMiddleware[], owner: Node, knownRouters: Set<string>, chain: Set<string>, sourceFile: string, currentPackage: string, helperStack: Set<string>, inheritedShadowed: Set<string>): ChiMiddleware[] {
    const statements = children(block, 'statement_list')[0]; if (!statements) return [...inherited];
    const shadowed = new Set(inheritedShadowed);
    const active = [...inherited];
    function applyHelper(key: string, call: Node): void {
      const candidates = helpers.definitions.get(key) ?? [];
      if (candidates.length !== 1 || helperStack.has(key)) { if (candidates.length) warnings.push(`${sourceFile}:${call.range().start.line + 1}: ambiguous or recursive router helper requires review.`); return; }
      const helper = candidates[0]!;
      const updated = scanBlock(helper.block, helper.router, prefix, active, helper.block, new Set(), chain, helper.file, helper.packageId, new Set([...helperStack, key]), new Set([helper.router]));
      active.splice(0, active.length, ...updated);
    }
    for (const statement of statements.children()) {
      if (statement.kind() === 'return_statement') break;
      if (statement.kind() === 'short_var_declaration') {
        const list = children(statement, 'expression_list')[0];
        for (const name of list ? children(list, 'identifier') : []) shadowed.add(name.text());
      }
      if (statement.kind() === 'var_declaration' || statement.kind() === 'const_declaration') {
        const specKind = statement.kind() === 'var_declaration' ? 'var_spec' : 'const_spec';
        for (const spec of statement.findAll({ rule: { kind: specKind } })) for (const name of children(spec, 'identifier')) shadowed.add(name.text());
      }
      const call = children(statement, 'call_expression')[0]; if (!call) continue;
      const selector = children(call, 'selector_expression')[0];
      if (!selector) {
        const functionName = children(call, 'identifier')[0]?.text();
        if (!functionName || shadowed.has(functionName) || args(call).length !== 1 || args(call)[0]?.text() !== router) continue;
        applyHelper(helperKey(sourceFile, currentPackage, functionName), call);
        continue;
      }
      const parts = selector.children(); const target = parts[0]; const method = parts.at(-1)?.text();
      if (!target || !method) continue;
      if (target.kind() === 'identifier' && target.text() !== router && !shadowed.has(target.text()) && /^[A-Z]/.test(method) && args(call).length === 1 && args(call)[0]?.text() === router) {
        const imported = helpers.imports.get(sourceFile)?.get(target.text());
        if (imported) applyHelper(helperKey(`${imported.directory}/_`, imported.packageId, method), call);
        continue;
      }
      let extra: ChiMiddleware[] = [];
      if (target.kind() === 'call_expression') {
        const withSelector = children(target, 'selector_expression')[0];
        if (!withSelector || withSelector.text() !== `${router}.With`) continue;
        extra = args(target).map(item => location(item, sourceFile));
      } else if (target.text() !== router) continue;
      const values = args(call);
      if (method === 'Use') { active.push(...values.map(item => location(item, sourceFile))); continue; }
      if (method === 'Route' || method === 'Group') {
        const segment = method === 'Route' ? literal(values[0]) : '';
        const callback = values.find(item => item.kind() === 'func_literal');
        const parameter = callback && children(callback, 'parameter_list')[0]?.find({ rule: { kind: 'parameter_declaration' } });
        const name = parameter && children(parameter, 'identifier')[0]?.text();
        const childBlock = callback && children(callback, 'block')[0];
        if (segment !== null && name && childBlock) scanBlock(childBlock, name, join(prefix, segment), [...active, ...extra], owner, knownRouters, chain, sourceFile, currentPackage, helperStack, new Set([...shadowed, name]));
        else warnings.push(`${sourceFile}:${call.range().start.line + 1}: dynamic ${method} registration requires review.`);
        continue;
      }
      let verb: string | undefined = methods[method]; let pathArg = values[0]; let handler = values[1];
      if (method === 'Method' || method === 'MethodFunc') { verb = literal(values[0]) ?? (values[0]?.text().match(/^http\.Method(Get|Post|Put|Patch|Delete|Head|Options)$/)?.[1]?.toUpperCase()); pathArg = values[1]; handler = values[2]; }
      if (method === 'Handle' || method === 'HandleFunc') verb = 'ANY';
      if ((method === 'Method' || method === 'MethodFunc') && !verb) { warnings.push(`${sourceFile}:${call.range().start.line + 1}: dynamic HTTP method requires review.`); continue; }
      if (verb) {
        const routePath = literal(pathArg);
        if (routePath === null || !handler) { warnings.push(`${sourceFile}:${call.range().start.line + 1}: dynamic route registration requires review.`); continue; }
        routes.push({ method: verb, path: join(prefix, routePath), handler: handler.text(), file: sourceFile, line: call.range().start.line + 1, middleware: [...active, ...extra] });
      } else if (method === 'Mount') {
        const mountPath = literal(values[0]); const child = values[1]?.text();
        if (mountPath !== null && child && knownRouters.has(child) && !chain.has(child)) { resolvedMounts.add(child); scanBlock(owner, child, join(prefix, mountPath), [...active, ...extra], owner, knownRouters, new Set([...chain, child]), sourceFile, currentPackage, helperStack, shadowed); }
        else warnings.push(`${sourceFile}:${call.range().start.line + 1}: mounted router requires review.`);
      }
    }
    return active;
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
      const parameters = children(fn, 'parameter_list').flatMap(list => children(list, 'parameter_declaration').flatMap(param => children(param, 'identifier').map(name => name.text())));
      for (const router of routerNames) if (!mounted.has(router)) scanBlock(block, router, '', [], block, routerNames, new Set([router]), file, packageId, new Set(), new Set(parameters));
      if ([...mounted].some(name => !resolvedMounts.has(name))) warnings.push(`${file}: mounted router cycle or unresolved entry point requires review.`);
    }
  }
  return { routes, warnings };
}
