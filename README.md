# Cress

Cress is a local-first desktop tool for exploring NestJS route authorization declarations and reviewing changes between Git revisions. It reports what it observes in source; it does not determine runtime access or scan for vulnerabilities.

![Cress access explorer](docs/screenshots/access-explorer.png)

## Desktop MVP

Download the appropriate unsigned package from the artifacts of a successful [GitHub Actions run](https://github.com/lucasonline0/cress/actions). Linux builds produce an AppImage; Windows and macOS builds are attempted in CI. Platform availability depends on the corresponding job succeeding. On Linux, make the AppImage executable (`chmod +x Cress-0.1.0.AppImage`) and launch it. AppImage requires a compatible Linux desktop and FUSE; it can also be extracted with `--appimage-extract`. Unsigned Windows and macOS builds may trigger SmartScreen or Gatekeeper warnings.

Choose **Open a project** and select a NestJS source directory, or use **Try the example**. The access explorer searches routes and shows declarations with source locations. In **Git changes**, enter a local branch, tag, or commit and compare it with the working tree. Git must be installed for comparisons; scanning does not require Git. Export scan JSON from the overview, or diff JSON and offline HTML from the changes view. Choose an export destination outside the analyzed project.

Analysis stays on your computer and does not execute the project. Dynamic expressions, custom decorators, global guards, middleware, and runtime policy behavior can make effective authorization unknown. No missing guard or removed declaration proves that a route is public or vulnerable. Git comparison does not fetch remotes. Source symlinks are skipped.

## Development

Requires Git and Node.js 22.12 or later. Electron 45's binary must be installed explicitly after npm installation:

```sh
npm ci
npx install-electron
npm run desktop:dev
```

For checks and packaging:

```sh
npm run typecheck
npm run desktop:typecheck
npm run lint
npm test
npm run build
npm run desktop:smoke
npm run desktop:package -- --linux --x64
```

The GUI smoke test requires a desktop display (on Linux, `xvfb-run -a npm run desktop:smoke` can provide one). It tests actual Electron interaction with native dialog responses mocked. Build output is under `release/`. The package includes Electron and needs no system Node installation.

## CLI

```sh
npm run build
node dist/cli.js scan path/to/project
node dist/cli.js scan path/to/project --format json
node dist/cli.js diff path/to/project --base main
node dist/cli.js report path/to/project --base main --output report.html
```

See `--help` for command options. Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). MIT licensed.
