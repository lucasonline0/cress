import { parentPort, workerData } from 'node:worker_threads';
import { spawnSync } from 'node:child_process';
import { analyzeProject } from '../../src/multiframework/project.js';
import { loadPolicies, evaluatePolicies } from '../../src/multiframework/policies.js';
import { compareProject } from '../../src/multiframework/project-diff.js';
try {
  const data = workerData as { project: string; base?: string };
  if (data.base === undefined) parentPort?.postMessage({ result: analyzeProject(data.project) });
  else { const result = compareProject(data.project, data.base); parentPort?.postMessage({ result: { ...result, policies: evaluatePolicies(loadPolicies(data.project), result.after, result.before) } }); }
} catch (error) {
  const data = workerData as { base?: string };
  const missingGit = data.base !== undefined && (spawnSync('git', ['--version'], { windowsHide: true }).error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
  parentPort?.postMessage({ error: missingGit ? 'Git is not installed or is not available on PATH. Scanning remains available.' : error instanceof Error ? error.message : String(error) });
}
