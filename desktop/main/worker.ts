import { parentPort, workerData } from 'node:worker_threads';
import { spawnSync } from 'node:child_process';
import { analyzeProject } from '../../src/multiframework/project.js';
import { loadPolicies, evaluatePolicies } from '../../src/multiframework/policies.js';
import { loadMatrix, saveMatrix } from '../../src/multiframework/matrix-store.js';
import { coverage, compareOpenApi, generateTest } from '../../src/multiframework/experience.js';
import { detectTestRunners } from '../../src/multiframework/test-runner.js';
import { compareProject } from '../../src/multiframework/project-diff.js';
try {
  const data = workerData as { project: string; base?: string; operation?: string; matrix?: unknown; openapi?: string; openapiFile?: string; routeIndex?: number; scenarios?: import('../../src/multiframework/experience.js').TestScenario[]; runner?: import('../../src/multiframework/experience.js').TestRunner };
  if (data.operation === 'loadMatrix') parentPort?.postMessage({ result: loadMatrix(data.project) });
  else if (data.operation === 'saveMatrix') parentPort?.postMessage({ result: saveMatrix(data.project, data.matrix) });
  else if (data.operation === 'detectRunner') { const route = analyzeProject(data.project).routes[data.routeIndex ?? -1]; if (!route) throw new Error('Route not found.'); parentPort?.postMessage({ result: detectTestRunners(data.project, route.application) }); }
  else if (data.operation === 'coverage') { const analysis = analyzeProject(data.project); parentPort?.postMessage({ result: { coverage: coverage(analysis, loadPolicies(data.project), loadMatrix(data.project)), drift: data.openapi === undefined ? null : compareOpenApi(data.openapi, analysis, loadMatrix(data.project), data.openapiFile) } }); }
  else if (data.operation === 'generate') { const analysis = analyzeProject(data.project); const route = analysis.routes[data.routeIndex ?? -1]; if (!route) throw new Error('Route not found.'); const entry = loadMatrix(data.project).entries.find(e => e.framework === route.framework && e.application === route.application && e.method === route.method && e.path === route.path); parentPort?.postMessage({ result: generateTest(route, data.scenarios ?? [{ profile: 'Unauthenticated', access: 'deny' }, ...(entry?.expectations ?? [])], data.runner) }); }
  else if (data.base === undefined) parentPort?.postMessage({ result: analyzeProject(data.project) });
  else { const result = compareProject(data.project, data.base); parentPort?.postMessage({ result: { ...result, policies: evaluatePolicies(loadPolicies(data.project), result.after, result.before) } }); }
} catch (error) {
  const data = workerData as { base?: string };
  const missingGit = data.base !== undefined && (spawnSync('git', ['--version'], { windowsHide: true }).error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
  parentPort?.postMessage({ error: missingGit ? 'Git is not installed or is not available on PATH. Scanning remains available.' : error instanceof Error ? error.message : String(error) });
}
