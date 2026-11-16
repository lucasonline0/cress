#!/usr/bin/env node
import { Command } from 'commander';
import { analyzePath } from './analyzer.js';
import { formatJson, formatTerminal } from './format.js';
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
program.parse();
