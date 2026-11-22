#!/usr/bin/env node
// create-punica: copies the application into a new folder.
//
//   npm create punica@latest my-app
import { cp, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RENAMED = { _gitignore: '.gitignore', _env: '.env' };

const [target = '.'] = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('Usage: npm create punica@latest <folder>');
  process.exit(0);
}

const folder = resolve(target);
const name = basename(folder)
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '-')
  .replace(/^[._-]+|-+$/g, '');

if (!name) {
  console.error(`"${target}" cannot be the name of a package. Give a folder such as my-app.`);
  process.exit(1);
}

await mkdir(folder, { recursive: true });

// What an empty folder may hold already: a repository, an editor's settings
const present = (await readdir(folder)).filter((entry) => !['.git', '.DS_Store', '.idea', '.vscode'].includes(entry));

if (present.length) {
  console.error(`${folder} is not empty (${present.slice(0, 3).join(', ')}${present.length > 3 ? ', …' : ''}). Choose another folder.`);
  process.exit(1);
}

await cp(fileURLToPath(new URL('./template/', import.meta.url)), folder, { recursive: true });

/** Gives the files npm would not carry under their own name their name back. */
const restore = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) await restore(path);
    else if (RENAMED[entry.name]) await rename(path, join(directory, RENAMED[entry.name]));
  }
};

await restore(folder);

const manifestPath = join(folder, 'package.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

manifest.name = name;
manifest.version = '0.1.0';
delete manifest.license;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

// The lockfile names the package too
const lockPath = join(folder, 'package-lock.json');
const lock = await readFile(lockPath, 'utf8').then(JSON.parse, () => null);

if (lock) {
  lock.name = name;
  lock.version = '0.1.0';

  if (lock.packages?.['']) {
    lock.packages[''].name = name;
    lock.packages[''].version = '0.1.0';
    delete lock.packages[''].license;
  }

  await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
}

const step = target === '.' ? '' : `  cd ${target}\n`;

console.log(`
An application on Punica Form, Punica Request and Punica Components is in ${folder}.

${step}  npm install
  npm run dev        the stand-in API and the application, on http://localhost:5173

Sign in as admin@example.com / secret123.
README.md says where things are; AGENTS.md says how the three libraries are
used together, for you and for an AI assistant (.mcp.json sets theirs up).
`);
