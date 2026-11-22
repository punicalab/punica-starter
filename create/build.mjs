// template/: the application of this repository as a new project gets it.
// What git tracks, without what belongs to the repository itself.
import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const template = fileURLToPath(new URL('./template/', import.meta.url));

/** Of the repository, not of an application made from it. */
const LEFT_OUT = [/^create\//, /^\.github\//, /^LICENSE$/, /^eval\//];
/** npm leaves these out of a package, or reads them itself: they travel under another name. */
const RENAMED = { '.gitignore': '_gitignore', '.env': '_env' };

const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((file) => file && !LEFT_OUT.some((pattern) => pattern.test(file)));

await rm(template, { recursive: true, force: true });

for (const file of files) {
  const name = file.split('/').pop();
  const target = join(template, dirname(file), RENAMED[name] ?? name);

  await mkdir(dirname(target), { recursive: true });
  await cp(join(root, file), target);
}

console.log(`template: ${files.length} files`);
