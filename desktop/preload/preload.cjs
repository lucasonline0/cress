const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cress', Object.freeze({
  openProject: () => ipcRenderer.invoke('project:open'),
  example: () => ipcRenderer.invoke('project:example'),
  scan: project => ipcRenderer.invoke('project:scan', project),
  compare: base => ipcRenderer.invoke('project:compare', base),
  exportResult: kind => ipcRenderer.invoke('project:export', kind),
}));
