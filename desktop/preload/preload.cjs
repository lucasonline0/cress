const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cress', Object.freeze({
  openProject: () => ipcRenderer.invoke('project:open'),
  example: () => ipcRenderer.invoke('project:example'),
  scan: project => ipcRenderer.invoke('project:scan', project),
  gitRefs: () => ipcRenderer.invoke('project:gitRefs'),
  compare: base => ipcRenderer.invoke('project:compare', base),
  exportResult: kind => ipcRenderer.invoke('project:export', kind),
  loadMatrix: () => ipcRenderer.invoke('experience:load'),
  saveMatrix: matrix => ipcRenderer.invoke('experience:save', matrix),
  coverage: includeOpenApi => ipcRenderer.invoke('experience:coverage', includeOpenApi === true),
  openApiSource: () => ipcRenderer.invoke('experience:source'),
  importOpenApi: () => ipcRenderer.invoke('experience:openapi'),
  detectRunner: index => ipcRenderer.invoke('experience:detectRunner', index),
  generateTest: (index, scenarios, runner) => ipcRenderer.invoke('experience:generate', index, scenarios, runner),
  exportText: (content, extension) => ipcRenderer.invoke('experience:export', content, extension),
  checkUpdate: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateProgress: callback => {
    if (typeof callback !== 'function') throw new TypeError('A callback is required');
    const listener = (_event, progress) => {
      if (!progress || typeof progress !== 'object') return;
      const phases = ['checking', 'downloading', 'verifying', 'installing', 'restarting'];
      if (!phases.includes(progress.phase)) return;
      const percent = typeof progress.percent === 'number' && Number.isFinite(progress.percent)
        ? Math.min(100, Math.max(0, progress.percent)) : null;
      callback({ phase: progress.phase, percent });
    };
    ipcRenderer.on('updates:progress', listener);
    return () => ipcRenderer.removeListener('updates:progress', listener);
  },
}));
