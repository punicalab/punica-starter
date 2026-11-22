// The command, run for real into a folder of its own. Run build.mjs first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('./index.mjs', import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });
const scratch = () => mkdtempSync(join(tmpdir(), 'create-punica-'));

test('makes an application in a new folder, under its name', () => {
  const cwd = scratch();
  const result = run(['My App'], cwd);
  const app = join(cwd, 'My App');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /npm install/);

  for (const file of [
    'package.json',
    'package-lock.json',
    '.gitignore',
    '.env',
    '.mcp.json',
    'AGENTS.md',
    'README.md',
    'index.html',
    'server/index.mjs',
    'src/api/client.ts',
    'src/forms/attendee.ts',
    'src/lib/formRequest.ts',
    'e2e/app.spec.ts'
  ]) {
    assert.ok(existsSync(join(app, file)), file);
  }

  // What belongs to the repository stays there, and nothing travels under its other name
  for (const file of ['create', '.github', 'LICENSE', '_gitignore', '_env', 'node_modules']) {
    assert.ok(!existsSync(join(app, file)), file);
  }

  const manifest = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(app, 'package-lock.json'), 'utf8'));

  assert.equal(manifest.name, 'my-app');
  assert.equal(manifest.private, true);
  assert.equal(lock.name, 'my-app');
  assert.equal(lock.packages[''].name, 'my-app');
  assert.match(manifest.dependencies['@punica/form'], /^\^2\./);
  assert.match(manifest.dependencies['@punica/request'], /^\^3\./);
  assert.match(manifest.dependencies['@punica/components'], /^\^2\./);
  assert.match(readFileSync(join(app, '.gitignore'), 'utf8'), /node_modules/);
});

test('fills the folder it is run in, when that is empty but for a repository', () => {
  const cwd = scratch();

  mkdirSync(join(cwd, '.git'));

  const result = run(['.'], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(cwd, 'src/main.tsx')));
  assert.doesNotMatch(result.stdout, /^ {2}cd /m);
});

test('refuses a folder that holds something, and leaves it alone', () => {
  const cwd = scratch();

  writeFileSync(join(cwd, 'notes.txt'), 'mine');

  const result = run(['.'], cwd);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not empty \(notes\.txt\)/);
  assert.equal(readFileSync(join(cwd, 'notes.txt'), 'utf8'), 'mine');
  assert.ok(!existsSync(join(cwd, 'package.json')));
});

test('says how it is used', () => {
  assert.match(run(['--help'], scratch()).stdout, /npm create punica@latest <folder>/);
});

test('what it makes installs, type-checks, passes its tests and builds', { skip: !process.env.CREATE_PUNICA_FULL }, () => {
  const cwd = scratch();

  assert.equal(run(['app'], cwd).status, 0);

  for (const args of [['ci'], ['run', 'typecheck'], ['test'], ['run', 'build']]) {
    execFileSync('npm', args, { cwd: join(cwd, 'app'), stdio: 'pipe' });
  }
});

test('the package holds the command and the template, and nothing else', () => {
  const files = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: fileURLToPath(new URL('.', import.meta.url)), encoding: 'utf8' }))[0].files.map((file) => file.path);

  assert.ok(files.includes('index.mjs'));
  assert.ok(files.includes('template/_gitignore'));
  assert.ok(files.includes('template/src/api/client.ts'));
  assert.ok(!files.some((file) => file.startsWith('template/create/') || file.includes('node_modules') || file === 'test.mjs' || file === 'build.mjs'));
});
