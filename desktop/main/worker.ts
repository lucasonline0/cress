import { parentPort, workerData } from 'node:worker_threads';
import { analyzePath } from '../../src/analyzer.js';
import { loadReportInputs } from '../../src/diff.js';
try {
  const data = workerData as { project: string; base?: string };
  parentPort?.postMessage({ result: data.base === undefined ? analyzePath(data.project) : loadReportInputs(data.project, data.base) });
} catch (error) { parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
