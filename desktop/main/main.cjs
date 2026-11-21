const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { Worker } = require('node:worker_threads');
let window;
let selected;
let busy = false;
let scanResult;
let reportResult;
function validSender(event) { return window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame; }
function requireSender(event) { if (!validSender(event)) throw new Error('Invalid sender'); }
function selectDirectory(input) {
  if (typeof input !== 'string' || !path.isAbsolute(input) || input.includes('\0')) throw new Error('Invalid project path');
  const resolved = fs.realpathSync(input);
  if (!fs.statSync(resolved).isDirectory()) throw new Error('Select a directory');
  return resolved;
}
app.whenReady().then(() => {
  window = new BrowserWindow({ icon: path.join(__dirname, '../renderer/icon_app.png'), width: 1280, height: 820, minWidth: 760, minHeight: 540, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  ipcMain.handle('project:open', async event => {
    requireSender(event);
    if (busy) throw new Error('An operation is already running');
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    selected = selectDirectory(result.filePaths[0]); scanResult = undefined; reportResult = undefined; return selected;
  });
  ipcMain.handle('project:example', event => { requireSender(event); if (busy) throw new Error('An operation is already running'); selected = selectDirectory(path.resolve(__dirname, '../../test/fixtures/nest-app/src')); scanResult = undefined; reportResult = undefined; return selected; });
  ipcMain.handle('project:scan', async (event, project) => {
    requireSender(event);
    if (typeof project !== 'string' || !selected || project !== selected || selectDirectory(project) !== selected) throw new Error('Select a project first');
    if (busy) throw new Error('A scan is already running');
    busy = true;
    try { scanResult = await runWorker({ project: selected }); reportResult = undefined; return scanResult; } finally { busy = false; }
  });
  ipcMain.handle('project:compare', async (event, base) => {
    requireSender(event);
    if (!selected || selectDirectory(selected) !== selected) throw new Error('Select a project first');
    if (typeof base !== 'string' || !base.trim() || base.length > 256 || base.includes('\0')) throw new Error('Enter a valid Git reference');
    if (busy) throw new Error('An operation is already running');
    busy = true;
    try { reportResult = await runWorker({ project: selected, base: base.trim() }); return reportResult.diff; } finally { busy = false; }
  });
  ipcMain.handle('project:export', async (event, kind) => {
    requireSender(event);
    if (!['scan', 'diff', 'html'].includes(kind)) throw new Error('Invalid export type');
    if (kind === 'scan' && !scanResult || kind !== 'scan' && !reportResult) throw new Error('Run the analysis first');
    const result = await dialog.showSaveDialog(window, { defaultPath: kind === 'html' ? 'cress-report.html' : `cress-${kind}.json`, filters: [{ name: kind === 'html' ? 'HTML' : 'JSON', extensions: [kind === 'html' ? 'html' : 'json'] }], properties: ['showOverwriteConfirmation'] });
    if (result.canceled || !result.filePath) return false;
    const destination = path.resolve(fs.realpathSync(path.dirname(result.filePath)), path.basename(result.filePath));
    try { if (fs.lstatSync(destination).isSymbolicLink()) throw new Error('Cannot export through a symbolic link'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (selected) { const relative = path.relative(selected, destination); if (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) throw new Error('Choose a destination outside the analyzed project'); }
    const content = kind === 'html' ? require('./report.cjs').createProjectReport(reportResult) : JSON.stringify(kind === 'scan' ? scanResult : reportResult.diff, null, 2) + '\n';
    const temporary = path.join(path.dirname(destination), `.cress-${require('node:crypto').randomUUID()}.tmp`);
    try { await fs.promises.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' }); await fs.promises.rename(temporary, destination); } finally { await fs.promises.rm(temporary, { force: true }); }
    return true;
  });
  window.loadFile(path.join(__dirname, '../renderer/index.html'));
});
function runWorker(data) {
  return new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'worker.cjs'), { workerData: data });
      worker.once('message', message => message.error ? reject(new Error(message.error)) : resolve(message.result));
      worker.once('error', reject);
      worker.once('exit', code => { if (code !== 0) reject(new Error(`Scan worker exited (${code})`)); });
    });
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
