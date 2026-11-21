import { openSync, readFileSync, closeSync, renameSync, unlinkSync, lstatSync, constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { emptyMatrix, validateMatrix, type AccessMatrix } from './experience.js';
function readConfig(root: string): Record<string, unknown> {
  const file = path.join(root, '.cress.json');
  try {
    const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const value: unknown = JSON.parse(readFileSync(fd, 'utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
      return value as Record<string, unknown>;
    } finally { closeSync(fd); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { policies: [] };
    throw new Error(`Cannot read .cress.json: ${error instanceof Error ? error.message : String(error)}`);
  }
}
export function loadMatrix(root: string): AccessMatrix { const config = readConfig(root); return config.accessMatrix === undefined ? emptyMatrix() : validateMatrix(config.accessMatrix); }
export function saveMatrix(root: string, input: unknown): AccessMatrix {
  const matrix = validateMatrix(input); const config = readConfig(root); const file = path.join(root, '.cress.json');
  try { if (lstatSync(file).isSymbolicLink()) throw new Error('Configuration must not be a symbolic link.'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const tmp = path.join(root, `.cress-${randomUUID()}.tmp`);
  const fd = openSync(tmp, 'wx', 0o600);
  try { try { const content = JSON.stringify({ ...config, accessMatrix: matrix }, null, 2) + '\n'; requireWrite(fd, content); } finally { closeSync(fd); } renameSync(tmp, file); } finally { try { unlinkSync(tmp); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
  return matrix;
}
import { writeFileSync } from 'node:fs';
function requireWrite(fd: number, content: string) { writeFileSync(fd, content, 'utf8'); }
