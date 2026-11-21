import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const updates = require('../desktop/main/updates.cjs') as {
  compareVersions(a: string, b: string): number;
  parseManifest(value: string): { status: string; version: string; url: string; sha256: string };
};
const manifest = [
  'status=ready',
  'version=0.3.1',
  'url=https://github.com/lucasonline0/cress/releases/download/v0.3.1/Cress-0.3.1.AppImage',
  'sha256=' + 'a'.repeat(64),
].join('\n');

describe('desktop update integrity', () => {
  it('compares stable semantic versions without lexicographic mistakes', () => {
    expect(updates.compareVersions('0.3.10', '0.3.9')).toBe(1);
    expect(updates.compareVersions('v0.3.0', '0.3.0')).toBe(0);
    expect(updates.compareVersions('0.2.0', '0.3.0')).toBe(-1);
    expect(updates.compareVersions('untrusted', '0.3.0')).toBe(0);
  });
  it('recognizes a published release with official origin and checksum', () => {
    expect(updates.parseManifest(manifest)).toMatchObject({ version: '0.3.1', status: 'ready' });
  });
  it('rejects untrusted URLs, duplicate fields, bad checksums and unavailable releases', () => {
    expect(() => updates.parseManifest(manifest.replace('github.com/lucasonline0/cress', 'example.com/attacker'))).toThrow();
    expect(() => updates.parseManifest(manifest + '\nversion=99.0.0')).toThrow();
    expect(() => updates.parseManifest(manifest.replace('a'.repeat(64), 'xyz'))).toThrow();
    expect(() => updates.parseManifest(manifest.replace('status=ready', 'status=pending'))).toThrow();
  });
});
