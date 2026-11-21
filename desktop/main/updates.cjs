'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { spawn } = require('node:child_process');

const MANIFEST = 'https://getcress.vercel.app/releases/linux-x86_64.txt';
const RELEASES = 'https://github.com/lucasonline0/cress/releases/latest';

function versionParts(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value || '');
  return match ? match.slice(1).map(Number) : null;
}
function compareVersions(a, b) {
  const left = versionParts(a), right = versionParts(b);
  if (!left || !right) return 0;
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  return 0;
}
function parseManifest(text) {
  if (typeof text !== 'string' || text.length > 4096) throw new Error('Invalid update manifest');
  const fields = {};
  for (const line of text.trim().split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index < 1) throw new Error('Invalid update manifest');
    const key = line.slice(0, index);
    if (!['status', 'version', 'url', 'sha256'].includes(key) || Object.hasOwn(fields, key)) throw new Error('Invalid update manifest');
    fields[key] = line.slice(index + 1);
  }
  if (fields.status !== 'ready') throw new Error('No stable update is currently published');
  if (!versionParts(fields.version) || !/^[a-f0-9]{64}$/.test(fields.sha256 || '')) throw new Error('Invalid update manifest');
  if (!/^https:\/\/github\.com\/lucasonline0\/cress\/releases\/download\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\.AppImage$/.test(fields.url || '')) throw new Error('Untrusted update URL');
  return fields;
}
function getManifest(url = MANIFEST, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 2) return reject(new Error('Too many update redirects'));
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.hostname !== 'getcress.vercel.app') return reject(new Error('Untrusted update host'));
    const req = https.get(target, { headers: { 'User-Agent': 'Cress-Desktop' }, timeout: 12000 }, response => {
      if ([301, 302, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        getManifest(new URL(response.headers.location, target).href, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume(); reject(new Error('Update server returned HTTP ' + response.statusCode)); return;
      }
      let value = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        value += chunk;
        if (value.length > 4096) response.destroy(new Error('Update manifest too large'));
      });
      response.on('end', () => { try { resolve(parseManifest(value)); } catch (error) { reject(error); } });
      response.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Update check timed out')));
    req.on('error', reject);
  });
}
function installScript(window, mainDirectory) {
  const file = path.join(mainDirectory, 'install.sh');
  if (!fs.statSync(file).isFile()) throw new Error('The packaged installer is unavailable');
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', [file], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let errorText = '';
    let total = 0;
    const onData = data => {
      total += data.length;
      if (total > 65536) { child.kill(); reject(new Error('Installer generated excessive output')); return; }
      errorText += data.toString();
    };
    child.stderr.on('data', onData);
    child.stdout.on('data', onData);
    const timeout = setTimeout(() => child.kill('SIGTERM'), 12 * 60 * 1000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('close', code => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(errorText.trim().slice(-600) || 'The installer failed. Your existing version was preserved.'));
    });
  });
}
function createUpdater({ app, dialog, shell, getWindow, isBusy, mainDirectory }) {
  let installing = false;
  const send = message => {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('updates:progress', message);
  };
  async function check() {
    const currentVersion = app.getVersion();
    if (process.platform !== 'linux' || process.arch !== 'x64') {
      return { currentVersion, available: false, supported: false, message: 'Automatic updates are currently supported on Linux x86_64.' };
    }
    const manifest = await getManifest();
    return {
      currentVersion,
      latestVersion: manifest.version,
      available: compareVersions(manifest.version, currentVersion) > 0,
      supported: app.isPackaged,
      message: app.isPackaged ? '' : 'Install a packaged Cress build to use automatic updates.'
    };
  }
  async function install() {
    if (installing || isBusy()) throw new Error('Another operation is in progress');
    const details = await check();
    const window = getWindow();
    if (!details.available) return { status: 'current' };
    if (!details.supported) {
      const answer = await dialog.showMessageBox(window, { type: 'info', title: 'Cress update', message: 'A new version is available', detail: 'This installation cannot be updated automatically. Open the official download page?', buttons: ['Cancel', 'Open downloads'], cancelId: 0, defaultId: 1, noLink: true });
      if (answer.response === 1) { await shell.openExternal(RELEASES); return { status: 'manual' }; }
      return { status: 'cancelled' };
    }
    const answer = await dialog.showMessageBox(window, {
      type: 'question', title: 'Update Cress', message: 'Update Cress to ' + details.latestVersion + '?',
      detail: 'Cress will download and verify the official AppImage, install it without administrator privileges, then restart automatically.',
      buttons: ['Cancel', 'Update and restart'], cancelId: 0, defaultId: 1, noLink: true
    });
    if (answer.response !== 1) return { status: 'cancelled' };
    installing = true;
    try {
      send('Downloading and verifying the update…');
      await installScript(window, mainDirectory);
      const launcher = path.join(os.homedir(), '.local', 'opt', 'cress', 'cress-desktop');
      if (!fs.statSync(launcher).isFile()) throw new Error('The updated launcher was not found');
      send('Update installed. Restarting Cress…');
      app.relaunch({ execPath: launcher, args: [] });
      app.quit();
      return { status: 'restarting' };
    } finally { installing = false; }
  }
  return { check, install };
}
module.exports = { createUpdater, compareVersions, parseManifest };
