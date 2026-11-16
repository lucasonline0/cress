# Cress

Cress is a local-first technical alpha that inventories NestJS route declarations and nearby authorization declarations from TypeScript source. It is not a vulnerability scanner. It parses syntax with ts-morph; it does not import or execute target-project code.

## Run locally

Requires Node.js 20+ and npm. In this repository:

```sh
npm install
npm run dev -- scan test/fixtures/nest-app/src
npm run dev -- scan test/fixtures/nest-app/src --format json
```

After building, run `node dist/cli.js scan <path>`. `npm run scan:example` is a short demo. The CLI also supports `--help` and `--version`.

## What is extracted

Recognized route decorators: `@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`, `@Options`, and `@Head`, paired with `@Controller`. Literal string and no-substitution template arguments are recorded; an omitted path is an empty declaration. Controller and handler paths are combined when both are statically known.

Controller and handler declarations are kept separately in `authorizationDeclarations`, each with decorator expression, scope, source file/line, and observed/unknown semantics. `@UseGuards` expressions are recorded as written, without evaluation; `@Roles` string arguments are extracted as literals. `@Public` is recognized by decorator name only: the analyzer does not know if the application's marker is implemented or honored. `@SetMetadata` is recorded as an unknown declaration; its keys and values are not assigned authorization meaning. Roles without a local guard receive a warning, but are not treated as effective access control.

The result also has a `globalDeclarations` collection. The analyzer recognizes syntactic `useGlobalGuards(...)` calls and `provide: APP_GUARD` registrations and records their source locations as unknown semantics. This does not establish which routes they apply to. Policy-based systems such as `@nestjs/authorization`, custom decorators, and runtime policy checks are not interpreted; encountered custom method decorators are recorded as unknown and warned about. No missing local guard or role declaration is treated as proof of public access or a vulnerability.

Terminal output includes source file and line for every route. JSON uses schema version 1: a root path, scanned file and controller counts, findings with paths, names, source locations, scoped authorization declarations, facts, status and warnings, global declarations, plus project warnings. Status values are `DECLARED` (recognized local guard or role declaration with statically readable path/metadata), `UNRESOLVED` (a relevant path or declaration has unknown semantics or could not be read), and `REQUIRES_REVIEW` (no recognized local guard/role declaration, or a `@Public` marker whose semantics are unknown). These are analysis labels, never authorization verdicts.

## Limits

Only class method routes with the listed decorator names are discovered. Dynamic paths and role arguments are not evaluated. Aliases, inherited/decorated base controllers, custom route decorators, `@All`, module discovery, global guard scope, middleware, custom decorator semantics, service-level checks, policy-based authorization behavior, and actual runtime behavior are not resolved. Global declaration detection is syntactic and may not establish that a token is Nest's `APP_GUARD` or that a call is Nest's application API. Unknown method decorators are preserved as unknown declarations. Parse errors are reported, but partial findings may be incomplete. Scanning is limited to `.ts` and `.tsx`; common generated/dependency directories are excluded.

The scan is read-only and offline: it reads source files, does not change the analyzed project, make network requests, load target modules, or collect telemetry. Do not treat an absent declaration as proof a route is public or a found declaration as proof it is enforced.

## Future interfaces

Git-based comparison should consume two schema-versioned `AnalysisResult` snapshots and compare stable source/controller/handler/method keys, while surfacing moved or ambiguous matches for review. A future HTML report can render the same JSON model without changing analyzer semantics. Neither capability is implemented yet.

## Product demo script

1. Clone or open the repository, then run `npm install`.
2. Run `npm run scan:example` and point out the users prefix, empty GET path, guard, role, and public marker rows.
3. Run `npm run dev -- scan test/fixtures/nest-app/src --format json` and show source locations and warnings.
4. Explain that the report inventories declarations; it does not prove runtime access decisions.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and [LICENSE](LICENSE) for terms.
