#!/usr/bin/env node
import { Command } from 'commander';
import { analyzeProject } from './multiframework/project.js';
import { compareProject } from './multiframework/project-diff.js';
import { formatProject, formatProjectDiff } from './multiframework/format.js';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadPolicies, evaluatePolicies } from './multiframework/policies.js';
import { createProjectReport } from './multiframework/report.js';
const program = new Command();
program.name('cress').description('Inventory supported API authorization declarations locally.').version('0.2.0');
program.command('scan').description('Scan a directory for supported API declarations.')
  .argument('<path>', 'directory to scan')
  .option('--format <format>', 'output format: terminal or json', 'terminal')
  .action((inputPath: string, options: { format: string }) => {
    if (!['terminal', 'json'].includes(options.format)) { console.error('Format must be terminal or json.'); process.exitCode = 2; return; }
    try {
      const result = analyzeProject(inputPath);
      process.stdout.write(options.format === 'json' ? `${JSON.stringify(result, null, 2)}\n` : formatProject(result));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
    }
  });
program.command('diff').description('Compare authorization declarations with a local Git revision.')
  .argument('<path>', 'project directory to compare')
  .requiredOption('--base <git-ref>', 'local Git commit, branch, or tag')
  .option('--format <format>', 'output format: terminal or json', 'terminal')
  .action((inputPath: string, options: { base: string; format: string }) => {
    if (!['terminal', 'json'].includes(options.format)) { console.error('Format must be terminal or json.'); process.exitCode = 2; return; }
    try {
      const { diff: result } = compareProject(inputPath, options.base);
      process.stdout.write(options.format === 'json' ? `${JSON.stringify(result, null, 2)}\n` : formatProjectDiff(result));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
    }
  });
program.command('check').description('Review changes and expected access policies.')
  .argument('<path>', 'project directory')
  .requiredOption('--base <git-ref>', 'local Git commit, branch, or tag')
  .option('--format <format>', 'output format: terminal or json', 'terminal')
  .action((inputPath: string, options: { base: string; format: string }) => {
    if (!['terminal', 'json'].includes(options.format)) { console.error('Format must be terminal or json.'); process.exitCode = 2; return; }
    try {
      const policies = loadPolicies(inputPath); const { before, after, diff } = compareProject(inputPath, options.base);
      const results = evaluatePolicies(policies, after, before);
      if (options.format === 'json') process.stdout.write(`${JSON.stringify({ diff, policies: results }, null, 2)}\n`);
      else process.stdout.write(`${formatProjectDiff(diff)}\nPolicies: ${results.length}\n${results.map(r => `${r.status} ${r.policy.framework} ${r.policy.method} ${r.policy.path}: ${r.reason}${r.missing.length ? ` Missing: ${r.missing.join(', ')}` : ''}\n${r.evidence.map(d => `  ${d.expression} [${d.source.file}:${d.source.line}]`).join('\n')}`).join('\n')}\n`);
      if (results.some(r => r.status === 'REVIEW_REQUIRED')) process.exitCode = 3;
    } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
  });
program.command('report').description('Write an offline HTML authorization comparison report.')
  .argument('<path>', 'project directory to compare')
  .requiredOption('--base <git-ref>', 'local Git commit, branch, or tag')
  .requiredOption('--output <file>', 'new HTML report file')
  .action((inputPath: string, options: { base: string; output: string }) => {
    try {
      const output = path.resolve(options.output);
      const { before, after, diff } = compareProject(inputPath, options.base);
      writeFileSync(output, createProjectReport({ before, after, diff }), { flag: 'wx', encoding: 'utf8' });
      process.stdout.write(`Wrote offline report to ${output}\n`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
    }
  });
program.parse();
