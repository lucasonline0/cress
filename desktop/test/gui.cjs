const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cress-gui-'));
  const repo = path.join(dir, 'project'); fs.mkdirSync(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args]);
  git('init', '-q'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Test');
  const source = path.join(repo, 'users.ts');
  fs.writeFileSync(source, "@Controller('users')\nclass Users { @Get() @Roles('ADMIN') list() {} }\n");
  git('add', '.'); git('commit', '-qm', 'baseline');
  fs.writeFileSync(source, "@Controller('users')\nclass Users { @Get() @Roles('USER') list() {} }\n");
  const app = await electron.launch({ args: ['desktop-dist/main/main.cjs'] });
  try {
    const w = await app.firstWindow();
    await w.getByRole('button', { name: 'Try the example' }).click();
    await w.getByText('Analysis overview').waitFor({ timeout: 30000 });
    await w.getByRole('button', { name: 'Access explorer' }).click();
    await w.getByLabel('Search routes').fill('users');
    await w.locator('.route').first().click();
    await w.getByText('Authorization declarations').waitFor();
    await w.screenshot({ path: process.env.CRESS_SCREENSHOT || path.join(os.tmpdir(), 'cress-desktop.png') });
    await app.evaluate(({ dialog }, paths) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [paths.repo] }); dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.output }); }, { repo, output: path.join(dir, 'report.html') });
    await w.getByRole('button', { name: 'Open a project' }).click();
    await w.getByText('Analysis overview').waitFor({ timeout: 30000 });
    await w.getByRole('button', { name: 'Git changes' }).click();
    await w.getByRole('button', { name: 'Compare' }).click();
    await w.locator('.route').filter({ hasText: 'DECLARATION_MODIFIED' }).first().waitFor({ timeout: 30000 });
    await w.locator('.route').filter({ hasText: 'DECLARATION_MODIFIED' }).first().click();
    await w.getByText("@Roles('ADMIN')").waitFor();
    await w.getByText("@Roles('USER')").waitFor();
    await w.getByRole('button', { name: 'Export HTML' }).click();
    await w.getByText('Export saved.').waitFor();
    if (!fs.readFileSync(path.join(dir, 'report.html'), 'utf8').includes('Authorization review')) throw new Error('Missing report content');
    console.log('Example exploration, Git comparison, and HTML export passed');
  } finally { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exit(1); });
