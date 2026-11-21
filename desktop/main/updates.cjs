'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { spawn } = require('node:child_process');

const API = 'https://api.github.com/repos/lucasonline0/cress/releases/latest';
const RELEASES = 'https://github.com/lucasonline0/cress/releases/latest';
const allowedHosts = new Set(['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);

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
function requestText(url, limit = 131072, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many update redirects'));
    const target = new URL(url);
    if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname)) return reject(new Error('Untrusted update host'));
    const req = https.get(target, { headers: { 'User-Agent': 'Cress-Desktop', 'Accept': 'application/vnd.github+json' }, timeout: 12000 }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        requestText(new URL(response.headers.location, target).href, limit, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume(); reject(new Error('Update service returned HTTP ' + response.statusCode)); return;
      }
      let value = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        value += chunk;
        if (value.length > limit) response.destroy(new Error('Update response too large'));
      });
      response.on('end', () => resolve(value));
      response.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Update check timed out')));
    req.on('error', reject);
  });
}
async function latestRelease() {
  const data = JSON.parse(await requestText(API));
  if (!data || typeof data !== 'object' || data.draft || data.prerelease) throw new Error('No stable Cress release found');
  const version = typeof data.tag_name === 'string' ? data.tag_name.replace(/^v/, '') : '';
  if (!versionParts(version) || !Array.isArray(data.assets)) throw new Error('No versioned Linux release is available');
  const name = 'Cress-' + version + '.AppImage';
  const image = data.assets.find(item => item && item.name === name);
  const checksum = data.assets.find(item => item && item.name === name + '.sha256');
  if (!image || !checksum) throw new Error('The latest release has no verified Linux package');
  const prefix = 'https://github.com/lucasonline0/cress/releases/download/';
  if (typeof image.browser_download_url !== 'string' || typeof checksum.browser_download_url !== 'string' ||
      !image.browser_download_url.startsWith(prefix) || !checksum.browser_download_url.startsWith(prefix) ||
      !image.browser_download_url.endsWith('/' + name) || !checksum.browser_download_url.endsWith('/' + name + '.sha256')) {
    throw new Error('Unexpected official release asset URLs');
  }
  return { version, name, url: image.browser_download_url, checksumUrl: checksum.browser_download_url };
}
function installScript(mainDirectory, manifestFile) {
  const file = path.join(mainDirectory, 'install.sh');
  if (!fs.statSync(file).isFile()) throw new Error('The packaged installer is unavailable');
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', [file], {
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      env: { ...process.env, CRESS_UPDATER_MANIFEST_FILE: manifestFile }
    });
    let output = '', bytes = 0;
    const collect = data => {
      bytes += data.length;
      if (bytes > 65536) { child.kill(); reject(new Error('Installer generated excessive output')); return; }
      output += data.toString();
    };
    child.stderr.on('data', collect);
    child.stdout.on('data', collect);
    const timer = setTimeout(() => child.kill('SIGTERM'), 12 * 60 * 1000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(output.trim().slice(-600) || 'The installer failed. Your existing version was preserved.'));
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
    const release = await latestRelease();
    return {
      currentVersion, latestVersion: release.version,
      available: compareVersions(release.version, currentVersion) > 0,
      supported: app.isPackaged,
      message: app.isPackaged ? '' : 'Install a packaged Cress build to use automatic updates.'
    };
  }
  async function install() {
    if (installing || isBusy()) throw new Error('Another operation is in progress');
    const window = getWindow();
    const details = await check();
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
    let directory;
    try {
      send('Checking the official release checksum…');
      const release = await latestRelease();
      if (compareVersions(release.version, app.getVersion()) <= 0) return { status: 'current' };
      const text = (await requestText(release.checksumUrl, 2048)).trim();
      const checksumMatch = /^([a-f0-9]{64})[ \t]+\*?([^\r\n]+)$/.exec(text);
      if (!checksumMatch || checksumMatch[2] !== release.name) throw new Error('The official release checksum is invalid');
      const manifest = parseManifest('status=ready\nversion=' + release.version + '\nurl=' + release.url + '\nsha256=' + checksumMatch[1] + '\n');
      directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cress-update-'));
      const manifestFile = path.join(directory, 'manifest.txt');
      fs.writeFileSync(manifestFile, 'status=' + manifest.status + '\nversion=' + manifest.version + '\nurl=' + manifest.url + '\nsha256=' + manifest.sha256 + '\n', { flag: 'wx', mode: 0o600 });
      send('Downloading and verifying Cress ' + release.version + '…');
      await installScript(mainDirectory, manifestFile);
      const launcher = path.join(os.homedir(), '.local', 'opt', 'cress', 'cress-desktop');
      if (!fs.statSync(launcher).isFile()) throw new Error('The updated launcher was not found');
      send('Update installed. Restarting Cress…');
      app.relaunch({ execPath: launcher, args: [] });
      app.quit();
      return { status: 'restarting' };
    } finally {
      installing = false;
      if (directory) fs.rmSync(directory, { recursive: true, force: true });
    }
  }
  return { check, install };
}
module.exports = { createUpdater, compareVersions, parseManifest };
