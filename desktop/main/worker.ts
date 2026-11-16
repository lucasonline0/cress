import { parentPort, workerData } from 'node:worker_threads';
import { analyzePath } from '../../src/analyzer.js';
try { parentPort?.postMessage({ result: analyzePath(workerData as string) }); }
catch (error) { parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
