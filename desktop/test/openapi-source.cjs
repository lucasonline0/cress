const { _electron: electron } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cress-openapi-'));
  const repo = path.join(dir, 'project'); fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, 'users.ts'), "@Controller('users')\nclass Users { @Get() list() {} }\n");
  const contract = path.join(dir, 'openapi.yaml');
  fs.writeFileSync(contract, 'openapi: 3.0.0\npaths:\n  /missing:\n    post: {}\n');
  const app = await electron.launch({ args: ['desktop-dist/main/main.cjs'] });
  try {
    const w = await app.firstWindow();
    await app.evaluate(({ dialog }, target) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] }); }, repo);
    await w.getByRole('button', { name: 'Open a project' }).last().click();
    await w.getByRole('button', { name: 'Rescan' }).waitFor({ timeout: 30000 });
    await w.getByRole('button', { name: 'Coverage & Drift' }).click();
    await app.evaluate(({ dialog }, target) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] }); }, contract);
    await w.getByRole('button', { name: 'Import OpenAPI' }).click();
    await w.getByRole('button', { name: `${contract}:4` }).click();
    await w.getByLabel('OpenAPI source').getByText('4 →     post: {}').waitFor();
    console.log('OpenAPI source navigation passed');
  } finally { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
