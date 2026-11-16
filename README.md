# Cress

Cress is a local-first technical alpha that inventories NestJS route declarations and nearby authorization declarations from TypeScript source. It is not a vulnerability scanner. It parses syntax with ts-morph; it does not import or execute target-project code.

## Run locally

Requires Node.js 20+ and npm. In this repository:

```sh
npm install
npm run dev -- scan test/fixtures/nest-app/src
npm run dev -- scan test/fixtures/nest-app/src --format json
npm run dev -- diff /path/to/nest-project --base main
npm run dev -- diff /path/to/nest-project --base main --format json
npm run dev -- report /path/to/nest-project --base main --output ./cress-report.html
```

Open the generated HTML file directly in a browser; no server is needed. `npm run scan:example` scans the included fixture. `npm run demo:diff` creates a temporary two-revision Git project, runs a declaration comparison, and generates an offline report. After building, use `node dist/cli.js <command>`. The CLI supports `--help` and `--version`.

## What is extracted

Recognized route decorators: `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@Options`, and `@Head`, paired with `@Controller`. Literal string and no-substitution template arguments are recorded; an omitted path is an empty declaration. Controller and handler paths are combined when both are statically known.

Controller and handler declarations are kept separately in `authorizationDeclarations`, each with decorator expression, scope, source file/line, and observed/unknown semantics. `@UseGuards` expressions are recorded as written, without evaluation; `@Roles` string arguments are extracted as literals. `@Public` is recognized by decorator name only: the analyzer does not know if the application's marker is implemented or honored. `@SetMetadata` is recorded as an unknown declaration; its keys and values are not assigned authorization meaning. Roles without a local guard receive a warning, but are not treated as effective access control.

The result also has a `globalDeclarations` collection. The analyzer recognizes syntactic `useGlobalGuards(...)` calls and `provide: APP_GUARD` registrations and records their source locations as unknown semantics. This does not establish which routes they apply to. Policy-based systems such as `@nestjs/authorization`, custom decorators, and runtime policy checks are not interpreted; encountered custom method decorators are recorded as unknown and warned about. No missing local guard or role declaration is treated as proof of public access or a vulnerability.

Terminal output includes source file and line for every route. JSON uses schema version 1: a root path, scanned file and controller counts, findings with paths, names, source locations, scoped authorization declarations, facts, status and warnings, global declarations, plus project warnings. Status values are `DECLARED` (recognized local guard or role declaration with statically readable path/metadata), `UNRESOLVED` (a relevant path or declaration has unknown semantics or could not be read), and `REQUIRES_REVIEW` (no recognized local guard/role declaration, or a `@Public` marker whose semantics are unknown). These are analysis labels, never authorization verdicts.

## Limits

Only class method routes with the listed decorator names are discovered. Dynamic paths and role arguments are not evaluated. Aliases, inherited/decorated base controllers, custom route decorators, `@All`, module discovery, global guard scope, middleware, custom decorator semantics, service-level checks, policy-based authorization behavior, and actual runtime behavior are not resolved. Global declaration detection is syntactic and may not establish that a token is Nest's `APP_GUARD` or that a call is Nest's application API. Unknown method decorators are preserved as unknown declarations. Parse errors are reported, but partial findings may be incomplete. Scanning is limited to `.ts` and `.tsx`; common generated/dependency directories are excluded.

The scan is read-only and offline: it reads source files, does not change the analyzed project, make network requests, load target modules, or collect telemetry. Do not treat an absent declaration as proof a route is public or a found declaration as proof it is enforced.

## Compare a Git revision

`diff` resolves a local commit, branch, or tag and reads source blobs from the local Git object database. It compares those declarations with the current working tree, including untracked TypeScript files. It does not fetch. The JSON `DiffResult` has `schemaVersion`, `base`, `root`, ordered `changes`, and `warnings`. Change types are `ROUTE_ADDED`, `ROUTE_REMOVED`, `ROUTE_MODIFIED`, `DECLARATION_ADDED`, `DECLARATION_REMOVED`, `DECLARATION_MODIFIED`, and `UNRESOLVED_CHANGE`. Each change includes a route identity, declaration scope/kind when relevant, before/after expressions and source locations, and a review explanation. These describe source changes only; no change type establishes an effective access result.

Route matching uses HTTP method, controller class name, and handler name. Duplicate identities are reported as unresolved. A handler or controller rename can appear as a route removal plus an addition; moving a file while keeping these names can still match. Dynamic route identities remain unresolved. The baseline contains only files in the selected commit, so untracked files are included only on the working-tree side and are called out. Common dependency/generated directories are excluded on both sides. Unrelated non-TypeScript changes do not create findings.

Example:

```sh
npm run dev -- diff . --base main
npm run dev -- diff . --base main --format json
npm run dev -- report . --base main --output ./cress-report.html
```

The report is a standalone HTML document with inline styles and script. It uses DOM `textContent` for project data and includes no remote assets, fonts, or requests. It shows working-tree routes, status and method filters, declaration details, source references, observed global declarations, changes, and limitations. The requested output file is the only file the report command creates; it refuses to overwrite an existing output file.

## Shared analysis model

Git comparisons and local HTML reports are implemented as consumers of the same `AnalysisResult` model. Git comparison reads local objects only; report rendering does not alter analyzer semantics.

## Product demo script

1. Install dependencies with `npm install`.
2. Run `npm run demo:diff` to create a temporary Git baseline with an `ADMIN` role and a working-tree revision with a `MEMBER` role and no local guard.
3. Review the terminal diff and open the generated report path printed by the script.
4. Show before/after declaration provenance and explain that removing a local declaration does not prove public access or a vulnerability.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and [LICENSE](LICENSE) for terms.
