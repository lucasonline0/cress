import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

interface Progress { phase: string; percent: number | null }

describe('desktop preload update events', () => {
  it('forwards structured progress, validates phases, and unsubscribes', () => {
    const listeners = new Map<string, (_event: unknown, progress: unknown) => void>();
    let bridge: { onUpdateProgress(cb: (progress: Progress) => void): () => void } | undefined;
    const electron = {
      contextBridge: {
        exposeInMainWorld(_key: string, api: typeof bridge) { bridge = api; },
      },
      ipcRenderer: {
        invoke() { return Promise.resolve(null); },
        on(channel: string, listener: (_event: unknown, progress: unknown) => void) {
          listeners.set(channel, listener);
        },
        removeListener(channel: string, listener: (_event: unknown, progress: unknown) => void) {
          if (listeners.get(channel) === listener) listeners.delete(channel);
        },
      },
    };
    const script = readFileSync(resolve('desktop/preload/preload.cjs'), 'utf8');
    runInNewContext(script, { require: (name: string) => {
      if (name !== 'electron') throw new Error('Unexpected module: ' + name);
      return electron;
    } });
    expect(bridge).toBeDefined();
    const updates: Progress[] = [];
    const unsubscribe = bridge!.onUpdateProgress(progress => updates.push(progress));
    const emit = listeners.get('updates:progress');
    expect(emit).toBeTypeOf('function');
    emit!({}, { phase: 'downloading', percent: 37, receivedBytes: 100 });
    emit!({}, { phase: 'verifying', percent: null });
    emit!({}, { phase: 'upgrading', percent: 66 });
    emit!({}, 'legacy message');
    emit!({}, { phase: 'restarting', percent: 110 });
    expect(updates.map(x => [x.phase, x.percent])).toEqual([
      ['downloading', 37],
      ['verifying', null],
      ['restarting', 100],
    ]);
    unsubscribe();
    expect(listeners.has('updates:progress')).toBe(false);
  });
});
