#!/usr/bin/env node
import { Command } from 'commander';
import { analyzePath } from './analyzer.js';
import { comparePath, loadReportInputs } from './diff.js';
import { formatDiffJson, formatDiffTerminal } from './diff-format.js';
import { formatJson, formatTerminal } from './format.js';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHtmlReport } from './report.js';
const program = new Command();
program.name('cress').description('Inventory NestJS route access declarations locally.').version('0.1.0');
program.command('scan').description('Scan a directory for NestJS controllers and route declarations.')
  .argument('<path>', 'directory to scan')
  .option('--format <format>', 'output format: terminal or json', 'terminal')
  .action((inputPath: string, options: { format: string }) => {
    if (!['terminal', 'json'].includes(options.format)) { console.error('Format must be terminal or json.'); process.exitCode = 2; return; }
    try {
      const result = analyzePath(inputPath);
      process.stdout.write(options.format === 'json' ? formatJson(result) : formatTerminal(result));
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
      const result = comparePath(inputPath, options.base);
      process.stdout.write(options.format === 'json' ? formatDiffJson(result) : formatDiffTerminal(result));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
    }
  });
program.command('report').description('Write an offline HTML authorization comparison report.')
  .argument('<path>', 'project directory to compare')
  .requiredOption('--base <git-ref>', 'local Git commit, branch, or tag')
  .requiredOption('--output <file>', 'new HTML report file')
  .action((inputPath: string, options: { base: string; output: string }) => {
    try {
      const output = path.resolve(options.output);
      const { before, after, diff } = loadReportInputs(inputPath, options.base);
      writeFileSync(output, createHtmlReport({ before, after, diff }), { flag: 'wx', encoding: 'utf8' });
      process.stdout.write(`Wrote offline report to ${output}\n`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
    }
  });
program.parse();
