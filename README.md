<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/cress-white.png">
    <img src="assets/brand/cress-black.png" alt="Cress mascot and wordmark" width="180">
  </picture>
</p>

<h1 align="center">cress.</h1>
<p align="center"><strong>Make access understandable.</strong></p>
<p align="center">Local-first · Open source · NestJS · Technical alpha</p>

Cress helps backend developers **explore declared authorization controls and review changes between revisions** without executing their applications or uploading source code.

> **Technical alpha:** Cress inspects source-level declarations. It does **not** determine effective permissions, prove that endpoints are public, or detect vulnerabilities.

## Why Cress?

Authorization logic is easy to scatter across guards, roles, decorators and application configuration. Cress offers a readable, traceable view of what is declared in a NestJS project and what changed.

- **Explore routes:** list recognized HTTP handlers, controller paths, guards, roles and other observed decorators.
- **Trace evidence:** findings point to their original files and source lines.
- **Compare revisions:** inspect added, removed and modified route/access declarations between a local Git baseline and the working tree.
- **Review visually:** generate a standalone, offline HTML report with filtering and change details.
- **Keep code local:** no accounts, hosted backend, paid API, telemetry or cloud processing.

## Quick start

Requires **Node.js 20.19+, 22.12+, or 24+**, npm, and Git for comparison commands. At this stage, Cress runs from the repository; it has **not** been published to npm.

```bash
git clone https://github.com/lucasonline0/cress.git
cd cress
npm ci

# Scan an included sample:
npm run scan:example

# Scan your own NestJS source directory:
npm run dev -- scan /path/to/your-nest-app/src

# Machine-readable output:
npm run dev -- scan /path/to/your-nest-app/src --format json
```

### Review authorization changes

Use a local Git branch, tag or commit as the baseline:

```bash
npm run dev -- diff /path/to/your-nest-app --base main
npm run dev -- diff /path/to/your-nest-app --base main --format json

npm run dev -- report /path/to/your-nest-app --base main --output ./cress-report.html
```

Open `cress-report.html` directly in a browser. No web server or network connection is needed. The report command writes only the specified output file and refuses to overwrite an existing one.

To see a self-contained demonstration, run `npm run demo:diff`.

### Output example

```text
GET /users
Before: Roles: ADMIN
After:  No local role declaration found

Review: Declared role restriction removed.
Effective access remains unknown.
```

*Illustrative output, not a claim about a real project.*

## How it works

Cress uses **TypeScript AST analysis** (`ts-morph`) without importing or executing code from the target project.

| Capability | Current scope |
| --- | --- |
| Route discovery | NestJS `@Controller` and common HTTP method decorators |
| Scoped declarations | Controller- and handler-level `@UseGuards`, `@Roles`, and observed metadata |
| Global observations | Syntactic `APP_GUARD` registrations and `useGlobalGuards` calls |
| Comparison | Local Git baseline vs. working tree |
| Reports | Terminal, deterministic JSON, and self-contained HTML |
| Uncertainty | Explicit `DECLARED`, `UNRESOLVED`, and `REQUIRES_REVIEW` analysis labels |

These labels **are not access-control verdicts**. Cress cannot evaluate runtime policies, custom decorator semantics, service-level checks, middleware, dynamic expressions, or whether a declared guard is actually enforced. Global guard observations do not prove that a specific route is protected. Renames and duplicate route identities may lead to ambiguous diff results. Repository and requested paths are canonicalized before containment checks; targets that resolve outside the repository are rejected. Symbolic-link entries are skipped and reported instead of being followed. Read-only parsing cannot guarantee complete coverage of a NestJS application.

For the detailed behavior, inspect [the analyzer](src/analyzer.ts), [Git comparison](src/diff.ts), and [HTML report renderer](src/report.ts).

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run demo:diff
```

Continuous integration runs these checks on **Ubuntu, macOS, and Windows**. The cross-platform matrix is configured, but its checks must pass before the project should be considered cross-platform verified.

See [CONTRIBUTING.md](CONTRIBUTING.md) to contribute and [LICENSE](LICENSE) for licensing.

## Security and privacy

Cress analyzes files locally and never imports target-project modules, fetches remote Git objects, or sends project data to a hosted service. The HTML report renders project content as untrusted data. Use the tool only for repositories you are authorized to inspect.

**Do not treat Cress as a vulnerability scanner or a substitute for authorization tests or a security assessment.**

## Roadmap

- [x] NestJS authorization declaration inventory
- [x] Local Git declaration comparison
- [x] Offline, filterable HTML report
- [ ] Expand real-world fixtures, harden cross-platform CI, and validate results on third-party projects
- [ ] Improve precision and usability based on feedback from developers

Cress is an early-stage, community-oriented developer tool. Feedback and reproducible test cases are welcome via GitHub issues.

<p align="center"><sub>Designed to stay local. Built to make the complicated clearer.</sub></p>
