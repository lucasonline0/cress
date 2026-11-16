const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Worker } = require('node:worker_threads');
let window;
let selected;
let busy = false;
function validSender(event) { return window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame; }
function requireSender(event) { if (!validSender(event)) throw new Error('Invalid sender'); }
function selectDirectory(input) {
  if (typeof input !== 'string' || !path.isAbsolute(input) || input.includes('\0')) throw new Error('Invalid project path');
  const resolved = fs.realpathSync(input);
  if (!fs.statSync(resolved).isDirectory()) throw new Error('Select a directory');
  return resolved;
}
app.whenReady().then(() => {
  window = new BrowserWindow({ width: 1280, height: 820, minWidth: 760, minHeight: 540, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  ipcMain.handle('project:open', async event => {
    requireSender(event);
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    selected = selectDirectory(result.filePaths[0]); return selected;
  });
  ipcMain.handle('project:example', event => { requireSender(event); selected = selectDirectory(path.resolve(__dirname, '../../test/fixtures/nest-app/src')); return selected; });
  ipcMain.handle('project:scan', async (event, project) => {
    requireSender(event);
    if (typeof project !== 'string' || !selected || project !== selected || selectDirectory(project) !== selected) throw new Error('Select a project first');
    if (busy) throw new Error('A scan is already running');
    busy = true;
    try { return await new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'worker.cjs'), { workerData: selected });
      worker.once('message', message => message.error ? reject(new Error(message.error)) : resolve(message.result));
      worker.once('error', reject);
      worker.once('exit', code => { if (code !== 0) reject(new Error(`Scan worker exited (${code})`)); });
    }); } finally { busy = false; }
  });
  window.loadFile(path.join(__dirname, '../renderer/index.html'));
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
