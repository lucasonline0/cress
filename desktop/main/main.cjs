const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const { createUpdater } = require('./updates.cjs');
const path = require('node:path');
const fs = require('node:fs');
const { Worker } = require('node:worker_threads');
let window;
let selected;
let selectionVersion = 0;
let busy = false;
let scanResult;
let reportResult;
let openApiSource;
function validSender(event) { return window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame; }
function requireSender(event) { if (!validSender(event)) throw new Error('Invalid sender'); }
function selectDirectory(input) {
  if (typeof input !== 'string' || !path.isAbsolute(input) || input.includes('\0')) throw new Error('Invalid project path');
  const resolved = fs.realpathSync(input);
  if (!fs.statSync(resolved).isDirectory()) throw new Error('Select a directory');
  return resolved;
}
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({ icon: path.join(__dirname, '../renderer/icon_app.png'), width: 1280, height: 820, minWidth: 760, minHeight: 540, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  const updater = createUpdater({ app, dialog, shell, getWindow: () => window, isBusy: () => busy, mainDirectory: __dirname });
  ipcMain.handle('updates:check', event => { requireSender(event); return updater.check(); });
  ipcMain.handle('updates:install', event => { requireSender(event); return updater.install(); });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  ipcMain.handle('project:open', async event => {
    requireSender(event);
    if (busy) throw new Error('An operation is already running');
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    if (busy) throw new Error('An operation is already running');
    selected = selectDirectory(result.filePaths[0]); selectionVersion++; scanResult = undefined; reportResult = undefined; openApiSource = undefined; return selected;
  });
  ipcMain.handle('project:example', event => { requireSender(event); if (busy) throw new Error('An operation is already running'); selected = selectDirectory(path.resolve(__dirname, '../../test/fixtures/nest-app/src')); selectionVersion++; scanResult = undefined; reportResult = undefined; openApiSource = undefined; return selected; });
  ipcMain.handle('project:scan', async (event, project) => {
    requireSender(event);
    if (typeof project !== 'string' || !selected || project !== selected || selectDirectory(project) !== selected) throw new Error('Select a project first');
    if (busy) throw new Error('A scan is already running');
    busy = true;
    try { scanResult = await runWorker({ project: selected }); reportResult = undefined; return scanResult; } finally { busy = false; }
  });
  ipcMain.handle('project:gitRefs', event => {
    requireSender(event);
    if (!selected || selectDirectory(selected) !== selected) return [];
    return runWorker({ project: selected, operation: 'gitRefs' });
  });
  ipcMain.handle('project:compare', async (event, base) => {
    requireSender(event);
    if (!selected || selectDirectory(selected) !== selected) throw new Error('Select a project first');
    if (typeof base !== 'string' || !base.trim() || base.length > 256 || base.includes('\0')) throw new Error('Enter a valid Git reference');
    if (busy) throw new Error('An operation is already running');
    busy = true;
    try { reportResult = await runWorker({ project: selected, base: base.trim() }); return { diff: reportResult.diff, policies: reportResult.policies }; } finally { busy = false; }
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
  async function experience(event, data) {
    requireSender(event);
    if (!selected || selectDirectory(selected) !== selected) throw new Error('Select a project first');
    if (busy) throw new Error('An operation is already running');
    busy = true; try { return await runWorker({ project: selected, ...data }); } finally { busy = false; }
  }
  function readExperience(event, data) {
    requireSender(event);
    if (!selected || selectDirectory(selected) !== selected) throw new Error('Select a project first');
    return runWorker({ project: selected, ...data });
  }
  ipcMain.handle('experience:load', event => readExperience(event, { operation: 'loadMatrix' }));
  ipcMain.handle('experience:save', (event, matrix) => experience(event, { operation: 'saveMatrix', matrix }));
  ipcMain.handle('experience:coverage', (event, includeOpenApi) => {
    const source = includeOpenApi === true ? openApiSource : undefined;
    return readExperience(event, { operation: 'coverage', analysis: scanResult, openapi: source?.text, openapiFile: source?.file });
  });
  ipcMain.handle('experience:detectRunner', (event, index) => { if (!Number.isSafeInteger(index) || index < 0) throw new Error('Invalid route'); return readExperience(event, { operation: 'detectRunner', analysis: scanResult, routeIndex: index }); });
  ipcMain.handle('experience:generate', (event, index, scenarios, runner) => { if (!Number.isSafeInteger(index) || index < 0 || !Array.isArray(scenarios) || scenarios.length > 100 || !['jest', 'vitest'].includes(runner)) throw new Error('Invalid test configuration'); return experience(event, { operation: 'generate', analysis: scanResult, routeIndex: index, scenarios, runner }); });
  ipcMain.handle('experience:openapi', async event => {
    requireSender(event); if (!selected) throw new Error('Select a project first');
    const version = selectionVersion;
    const result = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'OpenAPI', extensions: ['json', 'yaml', 'yml'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    const file = result.filePaths[0]; const stat = await fs.promises.stat(file); if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw new Error('Select an OpenAPI file smaller than 5 MB');
    const text = await fs.promises.readFile(file, 'utf8');
    if (selectionVersion !== version) throw new Error('The project changed. Import the document again.');
    const report = await experience(event, { operation: 'coverage', analysis: scanResult, openapi: text, openapiFile: file });
    openApiSource = { file, text }; return report;
  });
  ipcMain.handle('experience:source', event => { requireSender(event); if (!selected || !openApiSource) throw new Error('Import an OpenAPI document first'); return openApiSource; });
  ipcMain.handle('experience:export', async (event, content, extension) => {
    requireSender(event); if (!selected || typeof content !== 'string' || content.length > 5 * 1024 * 1024 || !['json', 'html', 'ts', 'go'].includes(extension)) throw new Error('Invalid export');
    const result = await dialog.showSaveDialog(window, { defaultPath: `cress-export.${extension}`, filters: [{ name: extension.toUpperCase(), extensions: [extension] }], properties: ['showOverwriteConfirmation'] });
    if (result.canceled || !result.filePath) return false;
    const destination = path.resolve(fs.realpathSync(path.dirname(result.filePath)), path.basename(result.filePath));
    try { if (fs.lstatSync(destination).isSymbolicLink()) throw new Error('Cannot export through a symbolic link'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const relative = path.relative(selected, destination); if (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) throw new Error('Choose a destination outside the analyzed project');
    const temporary = path.join(path.dirname(destination), `.cress-${require('node:crypto').randomUUID()}.tmp`);
    try { await fs.promises.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' }); await fs.promises.rename(temporary, destination); } finally { await fs.promises.rm(temporary, { force: true }); } return true;
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
