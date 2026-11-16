import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demoRoot = mkdtempSync(path.join(os.tmpdir(), 'cress-auth-review-demo-'));
const sourceDir = path.join(demoRoot, 'src');
mkdirSync(sourceDir, { recursive: true });
cpSync(path.join(repository, 'examples/auth-review/before/users.controller.ts'), path.join(sourceDir, 'users.controller.ts'));
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(result.stderr || result.error?.message || `${command} failed`);
  if (result.stdout) process.stdout.write(result.stdout);
}
const git = process.platform === 'win32' ? 'git.exe' : 'git';
run(git, ['init', '-q'], demoRoot);
run(git, ['config', 'user.name', 'Cress Demo'], demoRoot);
run(git, ['config', 'user.email', 'cress-demo@example.invalid'], demoRoot);
run(git, ['add', '.'], demoRoot);
run(git, ['commit', '-qm', 'before authorization change'], demoRoot);
cpSync(path.join(repository, 'examples/auth-review/after/users.controller.ts'), path.join(sourceDir, 'users.controller.ts'));
const tsx = path.join(repository, 'node_modules', 'tsx', 'dist', 'cli.mjs');
run(process.execPath, [tsx, path.join(repository, 'src/cli.ts'), 'diff', demoRoot, '--base', 'HEAD'], repository);
const report = path.join(demoRoot, 'cress-report.html');
run(process.execPath, [tsx, path.join(repository, 'src/cli.ts'), 'report', demoRoot, '--base', 'HEAD', '--output', report], repository);
process.stdout.write(`Open this offline report in a browser: ${report}\nDemo Git project: ${demoRoot}\n`);
