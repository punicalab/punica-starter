// What does it cost an assistant to build the same two screens on Punica and
// on a mainstream stack, and does what it builds work?
//
//   node run.mjs                  the plan and its estimated cost; nothing is called
//   node run.mjs --prepare        installs the two stacks under .stacks/ (no model is called)
//   node run.mjs --yes            runs it (needs ANTHROPIC_API_KEY or `ant auth login`)
//   node run.mjs --yes --only form --conditions mainstream,punica-agents --reps 1
//   node run.mjs --check <dir> --task form     scores a workspace that exists; no model is called
//
// Options: --models a,b  --effort low|medium|high|xhigh  --reps n  --budget dollars
//   --local http://127.0.0.1:11434   a local server of the Messages API (Ollama): free, no effort, no cache, no count
//
// Conditions (each starts from the same empty scaffold of its stack):
//   mainstream     React Hook Form + Zod, axios, TanStack Query, MUI; nothing to read: models know them
//   punica-guides  Punica as it was: the guides of the three MCP servers in the prompt, the full `get_component`
//   punica-agents  Punica as it is: AGENTS.md of this repository in the prompt, the bridge
//                  (src/lib/formRequest.ts) in the workspace, `get_component` with `brief`
//
// A run is one conversation: the model reads and writes files with tools and
// may run the type check. What it leaves is scored by the type check, a
// production build, the validators of the libraries, and the checks of the
// task in Chromium against the stand-in API (../server/index.mjs).
import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, stat, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startApi } from '../server/index.mjs';
import { tasks } from './tasks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const CONDITIONS = {
  mainstream: {
    stack: 'mainstream',
    uses: 'The project uses React Hook Form with Zod (@hookform/resolvers), axios, TanStack Query and MUI (@mui/material). Use them.'
  },
  'punica-guides': {
    stack: 'punica',
    uses: 'The project uses Punica Form (@punica/form, -kit, -react, -schema, -service), Punica Request (@punica/request, -fetch, -middleware), Punica Components (@punica/components, custom elements named punica-*) and TanStack Query. Use them. The tools named form_*, request_* and components_* look their APIs up and check code that uses them; the guides of the three libraries follow.'
  },
  'punica-agents': {
    stack: 'punica',
    uses: 'The project uses Punica Form (@punica/form, -kit, -react, -schema, -service), Punica Request (@punica/request, -fetch, -middleware), Punica Components (@punica/components, custom elements named punica-*) and TanStack Query. Use them. The tools named form_*, request_* and components_* look their APIs up and check code that uses them. The guide of an application like this one follows. Of the files it names, only src/lib/formRequest.ts is in this project; there is no .mcp.json and no command line, the tools above stand in for them; where the guide and the task differ (where the token is kept, for example), the task decides.'
  }
};
const BASE = `You are finishing a screen of a Vite + React 19 + TypeScript (strict) application. The scaffold is there: package.json, src/main.tsx with the providers, src/App.tsx with the routes, and placeholder pages. Dependencies are installed and you cannot add any. Read and write files with the tools; paths are relative to the project. Run the type check before you finish and leave it clean. There is no browser and no dev server to try things in. When the task is done, say so in one sentence.`;

// $ per 1M tokens: input, output, cache read. A cache write costs 1.25 × input.
const PRICE = {
  'claude-opus-5-5': [4, 20, 0.2],
  'claude-sonnet-5-5': [2, 10, 0.1],
  'claude-haiku-5-5': [0.1, 0.5, 0.01],
  'claude-fable-5-2': [8, 40, 0.2]
};
// These models can decline a request; the server then answers on a fallback, and the run records which model answered.
const WITH_FALLBACK = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-2'];

// A local server that speaks the Messages API (Ollama, llama.cpp): its models cost nothing and know no Anthropic extras
const LOCAL = flag('--local');
const MODELS = (flag('--models') || 'claude-opus-5-5').split(',');
if (LOCAL) for (const model of MODELS) PRICE[model] ??= [0, 0, 0];
const NAMES = (flag('--conditions') || Object.keys(CONDITIONS).join(',')).split(',');
const ONLY = flag('--only')?.split(',');
const TASKS = ONLY ? tasks.filter((task) => ONLY.includes(task.id)) : tasks;
const REPS = Number(flag('--reps') || 3);

if (!Number.isInteger(REPS) || REPS < 1) throw new Error('--reps must be a whole number above 0');
if (!TASKS.length) throw new Error(`--only names no task; there are ${tasks.map((task) => task.id).join(', ')}`);
const EFFORT = flag('--effort') || 'medium';
const MAX_TURNS = 40;
// Thinking counts too: a turn that writes a long file needs the room
const MAX_TOKENS = 32000;
// The files a run is scored with: the model does not write them, and they are put back before scoring
const FIXED = ['package.json', 'tsconfig.json', 'vite.config.ts', 'index.html', '.env'];
const API_PORT = 4510;
const WEB_PORT = 4610;

for (const name of NAMES) if (!CONDITIONS[name]) throw new Error(`No condition ${name}; there are ${Object.keys(CONDITIONS).join(', ')}`);
for (const model of MODELS) if (!PRICE[model]) throw new Error(`No price for ${model}; add it to PRICE`);

const stackDir = (stack) => path.join(HERE, '.stacks', stack);
const run = (command, argv, cwd, timeout = 180_000) => {
  const result = spawnSync(command, argv, { cwd, encoding: 'utf8', timeout });

  return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
};

// ---------------------------------------------------------------- stacks

async function prepare() {
  for (const stack of new Set(Object.values(CONDITIONS).map((condition) => condition.stack))) {
    await mkdir(stackDir(stack), { recursive: true });
    await cp(path.join(HERE, 'workspaces', stack, 'package.json'), path.join(stackDir(stack), 'package.json'));
    console.log(`npm install for ${stack} …`);

    const installed = run('npm', ['install', '--no-audit', '--no-fund'], stackDir(stack), 600_000);

    if (!installed.ok) throw new Error(installed.output.slice(-2000));
  }
}

const prepared = (stack) => existsSync(path.join(stackDir(stack), 'node_modules', 'vite'));

/** A fresh copy of the scaffold of a condition, with the installed packages linked in. */
async function workspace(condition, dir) {
  const { stack } = CONDITIONS[condition];

  await mkdir(dir, { recursive: true });
  await cp(path.join(HERE, 'workspaces', 'shared'), dir, { recursive: true });
  await cp(path.join(HERE, 'workspaces', stack), dir, { recursive: true });
  await writeFile(path.join(dir, '.env'), `VITE_API_URL=http://127.0.0.1:${API_PORT}/api\n`);
  await symlink(path.join(stackDir(stack), 'node_modules'), path.join(dir, 'node_modules'));

  if (condition === 'punica-agents') {
    await mkdir(path.join(dir, 'src', 'lib'), { recursive: true });
    await cp(path.join(HERE, '..', 'src', 'lib', 'formRequest.ts'), path.join(dir, 'src', 'lib', 'formRequest.ts'));
  }
}

/** The scoring configuration as the scaffold has it, whatever happened to it. */
async function restore(condition, dir) {
  const { stack } = CONDITIONS[condition];

  for (const file of FIXED) {
    for (const from of ['shared', stack]) {
      const source = path.join(HERE, 'workspaces', from, file);

      if (existsSync(source)) await cp(source, path.join(dir, file));
    }
  }

  await writeFile(path.join(dir, '.env'), `VITE_API_URL=http://127.0.0.1:${API_PORT}/api\n`);
}

/** The guide of this repository as the model gets it: without the one sentence a check waits for. */
const agentsGuide = async () => (await readFile(path.join(HERE, '..', 'AGENTS.md'), 'utf8')).replaceAll('This email is already registered', 'That email is taken');

// ---------------------------------------------------------------- the MCP servers of the libraries

const SERVERS = { form: '@punica/form-mcp', request: '@punica/request-mcp', components: '@punica/components-mcp' };
// The guides are in the prompt; examples are fetched from the documentation site, which a measurement should not depend on
const HIDDEN = ['get_guide', 'get_migration_guide', 'get_form_schema', 'validate_form', 'get_examples'];
// `brief` came with components 2.2: the condition that stands for before it does not hear of it
const withoutBrief = (text) => text.replace(/[^.]*\bbrief\b[^.]*\.[ \t]*/gi, '');

/** The three servers, started the way an editor starts them, from the installed packages. */
async function startServers() {
  const root = stackDir('punica');
  const servers = {};

  for (const [prefix, name] of Object.entries(SERVERS)) {
    const directory = path.join(root, 'node_modules', name);
    const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    const bin = typeof manifest.bin === 'string' ? manifest.bin : Object.values(manifest.bin)[0];
    const client = new Client({ name: 'punica-starter-eval', version: '1.0.0' });

    await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(directory, bin)], cwd: root, stderr: 'ignore' }));
    servers[prefix] = { client, tools: (await client.listTools()).tools, version: manifest.version };
  }

  return servers;
}

const textOf = (result) => (result.content ?? []).filter((block) => block.type === 'text').map((block) => block.text).join('\n');
const call = async (servers, prefix, name, input) => {
  const result = await servers[prefix].client.callTool({ name, arguments: input });

  if (result.isError) throw new Error(textOf(result) || 'The tool failed.');

  return textOf(result);
};

/** The tools of the servers as the model sees them. `brief` did not exist before components 2.2. */
function libraryTools(servers, condition) {
  return Object.entries(servers).flatMap(([prefix, server]) =>
    server.tools
      .filter((tool) => !HIDDEN.includes(tool.name))
      .map((tool) => {
        const schema = structuredClone(tool.inputSchema);

        const before = condition === 'punica-guides';

        if (before && schema.properties?.brief) delete schema.properties.brief;

        return { name: `${prefix}_${tool.name}`, description: before ? withoutBrief(tool.description) : tool.description, input_schema: schema };
      })
  );
}

// ---------------------------------------------------------------- the tools of the workspace

const WORKSPACE_TOOLS = [
  {
    name: 'list_files',
    description: 'The entries of a directory of the project; directories end with a slash.',
    input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Relative to the project; "." for the root' } }, required: ['path'], additionalProperties: false }
  },
  {
    name: 'read_file',
    description: 'A file of the project, node_modules included (type declarations, for example). Long files come 400 lines at a time.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, from_line: { type: 'integer', description: 'The first line to return; 1 by default' } },
      required: ['path'],
      additionalProperties: false
    }
  },
  {
    name: 'write_file',
    description: 'Writes a file of the project, whole; directories are made as needed.',
    input_schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false }
  },
  {
    name: 'typecheck',
    description: 'Runs tsc --noEmit on the project and returns what it reports.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false }
  }
];

const typecheck = (dir) => run(process.execPath, [path.join(dir, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '-p', '.'], dir);

/** A path the model gave, kept inside the project. */
function inside(dir, given) {
  const full = path.resolve(dir, String(given ?? ''));

  if (full !== dir && !full.startsWith(dir + path.sep)) throw new Error('That path is outside the project.');

  return full;
}

const CAP = 30000;
const capped = (text) => (text.length > CAP ? `${text.slice(0, CAP)}\n\n[cut after ${CAP} characters]` : text) || '(no output)';

async function workspaceTool(dir, name, input) {
  try {
    return capped(await workspaceAction(dir, name, input));
  } catch (error) {
    // Without the path of this machine, which names the condition
    throw new Error(error.code ? `${error.code}: ${input.path}` : error.message);
  }
}

async function workspaceAction(dir, name, input) {
  if (name === 'typecheck') {
    const result = typecheck(dir);

    return result.ok ? 'No errors.' : result.output.replaceAll(dir + path.sep, '').slice(0, 6000) || 'The type check did not finish.';
  }

  const full = inside(dir, input.path);

  if (name === 'list_files') {
    const entries = await readdir(full, { withFileTypes: true });

    return entries.map((entry) => (entry.isDirectory() || entry.isSymbolicLink() ? `${entry.name}/` : entry.name)).sort().join('\n') || '(empty)';
  }

  if (name === 'read_file') {
    const lines = (await readFile(full, 'utf8')).split('\n');
    const from = Math.max(1, Number(input.from_line) || 1);
    const part = lines.slice(from - 1, from + 399).join('\n');
    const more = lines.length > from + 399 ? `\n\n[lines ${from}-${from + 399} of ${lines.length}; ask for from_line ${from + 400} to read on]` : '';

    return `${part}${more}` || '(empty)';
  }

  if (name === 'write_file') {
    if (typeof input.content !== 'string') throw new Error('content must be a string.');
    const relative = path.relative(dir, full);

    // The file system does not tell Node_Modules from node_modules
    if (relative.split(path.sep)[0].toLowerCase() === 'node_modules') throw new Error('node_modules cannot be written.');
    if (FIXED.some((file) => file.toLowerCase() === relative.toLowerCase())) throw new Error(`${relative} is fixed; the task does not need it changed.`);

    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, input.content);

    return `Wrote ${path.relative(dir, full)}.`;
  }

  throw new Error(`There is no tool ${name}.`);
}

// ---------------------------------------------------------------- one conversation

async function systemOf(condition, servers) {
  const parts = [BASE, CONDITIONS[condition].uses];

  if (condition === 'punica-guides') {
    for (const prefix of Object.keys(SERVERS)) parts.push(`# The guide of ${SERVERS[prefix]}\n\n${withoutBrief(await call(servers, prefix, 'get_guide', {}))}`);
  }

  if (condition === 'punica-agents') parts.push(await agentsGuide());

  return parts.join('\n\n');
}

const costOf = (model, usage) => {
  const [input, output, cacheRead] = PRICE[model];

  return ((usage.input + usage.cacheWrite * 1.25) * input + usage.cacheRead * cacheRead + usage.output * output) / 1e6;
};

/**
 * The model works on the task in `dir` until it says it is done. What it
 * used is written into `record` as it goes, so that a conversation that
 * fails half-way is still accounted for.
 */
async function converse(anthropic, { model, condition, task, dir, servers, record, allowance }) {
  const tools = [...WORKSPACE_TOOLS, ...(servers ? libraryTools(servers, condition) : [])];
  const offered = new Set(tools.map((tool) => tool.name));
  const system = await systemOf(condition, servers);
  const messages = [{ role: 'user', content: task.prompt }];
  const answeredBy = new Set();

  Object.assign(record, { stop: 'turn-limit', turns: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, calls: {}, answeredBy: [], cost: 0, messages });

  while (record.turns < MAX_TURNS) {
    if (record.cost >= allowance) {
      record.stop = 'budget';
      break;
    }

    // Streamed: a turn this long would otherwise run into the time limit of a request
    const response = await anthropic.beta.messages
      .stream({
        model,
        max_tokens: MAX_TOKENS,
        ...(LOCAL
          ? {}
          : {
              output_config: { effort: EFFORT },
              // The prompt, the tools and the conversation so far are read from the cache on the next turn
              cache_control: { type: 'ephemeral' }
            }),
        system,
        tools,
        messages,
        ...(!LOCAL && WITH_FALLBACK.includes(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {})
      })
      .finalMessage();

    record.turns++;
    answeredBy.add(response.model);
    record.answeredBy = [...answeredBy];
    record.usage.input += response.usage.input_tokens;
    record.usage.output += response.usage.output_tokens;
    record.usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;
    record.usage.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;
    record.cost = costOf(model, record.usage);
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'pause_turn') continue;

    if (response.stop_reason !== 'tool_use') {
      record.stop = response.stop_reason;
      break;
    }

    const results = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      record.calls[block.name] = (record.calls[block.name] ?? 0) + 1;

      try {
        if (!offered.has(block.name)) throw new Error(`There is no tool ${block.name}.`);

        const [prefix, ...rest] = block.name.split('_');
        const input = { ...(block.input ?? {}) };
        let content;

        if (servers && Object.hasOwn(servers, prefix)) {
          if (condition === 'punica-guides') delete input.brief;

          content = capped(await call(servers, prefix, rest.join('_'), input));
        } else content = await workspaceTool(dir, block.name, input);

        results.push({ type: 'tool_result', tool_use_id: block.id, content });
      } catch (error) {
        results.push({ type: 'tool_result', tool_use_id: block.id, content: String(error.message) || 'The tool failed.', is_error: true });
      }
    }

    messages.push({ role: 'user', content: results });
  }
}

// ---------------------------------------------------------------- scoring

async function sources(dir, directory = 'src') {
  const found = [];

  for (const entry of await readdir(path.join(dir, directory), { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);

    if (entry.isDirectory()) found.push(...(await sources(dir, relative)));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) found.push(relative);
  }

  return found;
}

/** What the validators of the libraries say about the files of the workspace. */
async function validators(dir, servers) {
  const findings = [];

  for (const file of await sources(dir)) {
    const code = await readFile(path.join(dir, file), 'utf8');
    const reports = [
      ['form', await call(servers, 'form', 'validate_code', { code }), /^(\d+) problems?:/],
      ['request', await call(servers, 'request', 'validate_code', { code }), /^(\d+) problems?:/]
    ];

    if (file.endsWith('.tsx')) reports.push(['components', await call(servers, 'components', 'validate_markup', { code, kind: 'jsx' }), /^(\d+) errors?,/]);

    for (const [library, report, count] of reports) {
      const errors = Number(count.exec(report)?.[1] ?? 0);

      if (errors) findings.push({ library, file, errors, report });
    }
  }

  return findings;
}

async function waitFor(url, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('the preview server stopped');

    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`${url} did not answer`);
}

/** The checks of the task against the built application and the stand-in API. */
async function browse(dir, task, browser) {
  const api = await startApi(API_PORT);
  const preview = spawn(process.execPath, [path.join(dir, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(WEB_PORT), '--strictPort'], { cwd: dir, stdio: 'ignore' });
  const results = [];

  try {
    await waitFor(`http://localhost:${WEB_PORT}/`, preview);

    for (const check of task.checks) {
      const context = await browser.newContext({ baseURL: `http://localhost:${WEB_PORT}` });
      const page = await context.newPage();

      page.setDefaultTimeout(8000);

      try {
        await page.request.post(`${api.url}/test/reset`);

        const token = await task.before(page, api.url);

        await check.run({ page, api: api.url, token, hits: async () => (await (await page.request.get(`${api.url}/test/state`)).json()).hits });
        results.push({ name: check.name, pass: true });
      } catch (error) {
        results.push({ name: check.name, pass: false, why: String(error.message).split('\n')[0].slice(0, 300) });
      } finally {
        await context.close();
      }
    }
  } finally {
    const gone = new Promise((resolve) => preview.once('exit', resolve));

    if (preview.exitCode === null && preview.kill()) await gone;

    api.server.closeAllConnections?.();
    await new Promise((resolve) => api.server.close(resolve));
  }

  return results;
}

async function score(dir, task, browser, servers) {
  const types = typecheck(dir);
  const build = run(process.execPath, [path.join(dir, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], dir);
  const checks = build.ok ? await browse(dir, task, browser) : task.checks.map((check) => ({ name: check.name, pass: false, why: 'the application does not build' }));
  const findings = servers ? await validators(dir, servers) : [];

  return {
    typecheck: types.ok,
    typeErrors: types.ok ? 0 : (types.output.match(/error TS\d+/g) ?? []).length,
    build: build.ok,
    buildOutput: build.ok ? undefined : build.output.slice(-1500),
    checks,
    validatorErrors: findings.reduce((sum, finding) => sum + finding.errors, 0),
    findings,
    pass: types.ok && build.ok && checks.every((check) => check.pass)
  };
}

// ---------------------------------------------------------------- reporting

const mean = (numbers) => (numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0);
const k = (tokens) => `${(tokens / 1000).toFixed(1)}k`;

function summarize(results) {
  const rows = [];
  const all = (usage) => usage.input + usage.cacheRead + usage.cacheWrite;

  for (const model of MODELS) {
    for (const task of TASKS) {
      for (const condition of NAMES) {
        const cell = results.filter((result) => result.model === model && result.task === task.id && result.condition === condition);
        // A conversation that was cut short says nothing about the stack: it is counted apart
        const set = cell.filter((result) => result.score && result.stop === 'end_turn');

        if (!cell.length) continue;

        const validator = CONDITIONS[condition].stack === 'punica' ? mean(set.map((r) => r.score.validatorErrors)).toFixed(1) : 'n/a';

        rows.push(
          set.length
            ? `| ${model} | ${task.id} | ${condition} | ${set.filter((r) => r.score.pass).length}/${set.length} | ${mean(set.map((r) => r.score.checks.filter((c) => c.pass).length)).toFixed(1)}/${task.checks.length} | ${set.filter((r) => r.score.typecheck).length}/${set.length} | ${validator} | ${mean(set.map((r) => r.turns)).toFixed(1)} | ${k(mean(set.map((r) => all(r.usage))))} | ${k(mean(set.map((r) => r.usage.output)))} | $${mean(set.map((r) => r.cost)).toFixed(2)} | ${mean(set.map((r) => r.seconds)).toFixed(0)}s | ${cell.length - set.length} |`
            : `| ${model} | ${task.id} | ${condition} | – | – | – | – | – | – | – | – | – | ${cell.length} |`
        );
      }
    }
  }

  const failed = results.flatMap((result) => (result.score?.checks ?? []).filter((check) => !check.pass).map((check) => `- ${result.condition} ${result.task} #${result.rep}: ${check.name} — ${check.why}`));
  const left = results.filter((result) => !result.score || result.stop !== 'end_turn').map((result) => `- ${result.condition} ${result.task} #${result.rep}: ${result.error ?? `stopped with ${result.stop}`}`);
  const others = results.filter((result) => (result.answeredBy ?? []).some((name) => name !== result.model)).map((result) => `- ${result.condition} ${result.task} #${result.rep}: answered by ${result.answeredBy.join(', ')}; its cost is counted at the price of ${result.model}`);

  return [
    '| Model | Task | Condition | Passed | Checks | Type check | Validator errors | Turns | Input tokens | Output tokens | Cost | Time | Left out |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    'Means per run that ended by itself. Input tokens are what the model read over the whole conversation, cached or not; the cost follows the price of each kind. "Left out" are runs that failed or were cut short (the token limit of a turn, the turn limit, the budget, a declined request).',
    ...(failed.length ? ['', 'Checks that failed:', ...failed] : []),
    ...(left.length ? ['', 'Left out:', ...left] : []),
    ...(others.length ? ['', 'Another model answered:', ...others] : [])
  ].join('\n');
}

// ---------------------------------------------------------------- the plan

// What a run is assumed to take, until a real run says otherwise: the tokens
// of the prompt and the tools, the turns, what each turn adds to the
// conversation, and what the model writes in all.
const ASSUMED = {
  mainstream: { prefix: 1500, turns: 16 },
  'punica-guides': { prefix: 15000, turns: 22 },
  'punica-agents': { prefix: 4500, turns: 20 }
};
const GROWTH = 4000;
const OUTPUT = 30000;

function estimate(model, condition) {
  const { prefix, turns } = ASSUMED[condition];
  const [input, output, cacheRead] = PRICE[model];
  const read = turns * prefix + (GROWTH * turns * (turns - 1)) / 2;
  const written = prefix + GROWTH * turns;

  return (read * cacheRead + written * 1.25 * input + OUTPUT * output) / 1e6;
}

// ---------------------------------------------------------------- main

if (args.includes('--prepare')) {
  await prepare();
  console.log('The stacks are installed.');
  process.exit(0);
}

if (flag('--check')) {
  const dir = path.resolve(flag('--check'));
  const task = tasks.find((one) => one.id === flag('--task'));

  if (!task) throw new Error(`--task must be one of ${tasks.map((one) => one.id).join(', ')}`);

  const punica = existsSync(path.join(dir, 'node_modules', '@punica'));
  const servers = punica ? await startServers() : undefined;
  const browser = await chromium.launch();
  const result = await score(dir, task, browser, servers);

  await browser.close();
  for (const server of Object.values(servers ?? {})) await server.client.close();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.pass ? 0 : 1);
}

// For an agent of an editor (Claude Code) as the model: the workspace of each task and condition, and the
// prompt of the run in BRIEF.md beside it; the editor's own MCP servers stand in for the tools. No model is called.
if (flag('--brief')) {
  const root = path.resolve(flag('--brief'));
  const servers = NAMES.some((name) => CONDITIONS[name].stack === 'punica') ? await startServers() : undefined;
  const MCP = { form: 'mcp__punica-form__', request: 'mcp__punica-request__', components: 'mcp__punica__' };

  for (const task of TASKS) {
    for (const condition of NAMES) {
      const dir = path.join(root, `${task.id}-${condition}`);
      const mine = CONDITIONS[condition].stack === 'punica' ? servers : undefined;
      let system = (await systemOf(condition, mine)).replace(
        'The tools named form_*, request_* and components_*',
        `The MCP tools ${Object.values(MCP).map((prefix) => `${prefix}*`).join(', ')}`
      );

      if (mine) system += `\n\nOf those tools, leave ${HIDDEN.join(', ')} alone${condition === 'punica-guides' ? ', and do not pass `brief`' : ''}.`;
      await workspace(condition, dir);
      await writeFile(path.join(root, `${task.id}-${condition}.BRIEF.md`), `${system}\n\n# The task\n\n${task.prompt}\n`);
      console.log(dir);
    }
  }

  for (const server of Object.values(servers ?? {})) await server.client.close();
  process.exit(0);
}

// A repetition of everything before the next one: a run that stops early still compares like with like
const runs = Array.from({ length: REPS }, (_, rep) => MODELS.flatMap((model) => TASKS.flatMap((task) => NAMES.map((condition) => ({ model, task, condition, rep: rep + 1 }))))).flat();
const expected = runs.reduce((sum, { model, condition }) => sum + estimate(model, condition), 0);
const BUDGET = LOCAL ? Infinity : Number(flag('--budget') || (expected * 2).toFixed(2));

if (!(BUDGET > 0)) throw new Error('--budget must be an amount in dollars');

console.log(`${runs.length} runs: ${TASKS.map((task) => task.id).join(', ')} × ${NAMES.join(', ')} × ${REPS} repetitions, on ${MODELS.join(', ')} at effort ${EFFORT}.`);
for (const model of MODELS) for (const condition of NAMES) console.log(`  ${model} ${condition}: about $${estimate(model, condition).toFixed(2)} a run`);
console.log(`Estimated cost about $${expected.toFixed(2)}. The run stops, in the middle of a conversation if need be, once $${BUDGET.toFixed(2)} is spent (--budget).`);
console.log('The estimate rests on assumed turns and sizes (ASSUMED in run.mjs); one repetition (--reps 1) shows the real ones.');

if (!args.includes('--yes')) {
  console.log('Nothing was called. Add --yes to run.');
  process.exit(0);
}

for (const stack of new Set(NAMES.map((name) => CONDITIONS[name].stack))) {
  if (!prepared(stack)) {
    console.log(`The ${stack} stack is not installed: run \`node run.mjs --prepare\` first.`);
    process.exit(1);
  }
}

const anthropic = LOCAL ? new Anthropic({ baseURL: LOCAL, apiKey: 'local' }) : new Anthropic();
const servers = NAMES.some((name) => CONDITIONS[name].stack === 'punica') ? await startServers() : undefined;
const serversOf = (condition) => (CONDITIONS[condition].stack === 'punica' ? servers : undefined);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const results = [];
const versions = servers ? Object.fromEntries(Object.entries(servers).map(([prefix, server]) => [SERVERS[prefix], server.version])) : {};
let spent = 0;

/** After every run: what is paid for is on disk. */
async function save() {
  await mkdir(path.join(HERE, 'results'), { recursive: true });
  await writeFile(path.join(HERE, 'results', `${stamp}.json`), JSON.stringify({ models: MODELS, conditions: NAMES, effort: EFFORT, reps: REPS, versions, spent, results }, null, 2));
  await writeFile(path.join(HERE, 'results', `${stamp}.md`), `# Eval ${stamp}\n\n${MODELS.join(', ')} at effort ${EFFORT}, ${REPS} repetitions. Spent $${spent.toFixed(2)}.\n\n${summarize(results)}\n`);
}

const close = async () => {
  for (const server of Object.values(servers ?? {})) await server.client.close();
};

// Before anything is paid for: the prompt and the tools of every condition
// are counted, which costs nothing and refuses what a conversation would refuse
try {
  for (const model of LOCAL ? [] : MODELS) {
    for (const condition of NAMES) {
      const mine = serversOf(condition);
      const counted = await anthropic.beta.messages.countTokens({
        model,
        system: await systemOf(condition, mine),
        tools: [...WORKSPACE_TOOLS, ...(mine ? libraryTools(mine, condition) : [])],
        messages: [{ role: 'user', content: TASKS[0].prompt }]
      });

      console.log(`  ${model} ${condition}: the prompt, the tools and the task are ${counted.input_tokens} tokens`);
    }
  }
} catch (error) {
  console.log(error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError ? `No usable credentials: set ANTHROPIC_API_KEY or run \`ant auth login\`. (${error.message})` : `The requests would be refused, nothing was spent: ${error.message}`);
  await close();
  process.exit(1);
}

const browser = await chromium.launch();

for (const { model, task, condition, rep } of runs) {
  if (spent >= BUDGET) {
    console.log(`$${spent.toFixed(2)} spent: the budget is used up, the remaining runs are left out.`);
    break;
  }

  const name = `${model}-${task.id}-${condition}-${rep}`;
  const dir = path.join(HERE, '.runs', stamp, name);
  const mine = serversOf(condition);
  const record = {};
  const result = { model, task: task.id, condition, rep, dir: path.relative(HERE, dir) };
  const started = Date.now();
  let fatal;

  process.stdout.write(`${model} ${task.id} ${condition} #${rep} … `);

  try {
    await workspace(condition, dir);
    await converse(anthropic, { model, condition, task, dir, servers: mine, record, allowance: BUDGET - spent });
  } catch (error) {
    result.error = String(error.message);
    // These would fail every run that follows in the same way
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError || error instanceof Anthropic.RateLimitError || error instanceof Anthropic.BadRequestError) fatal = error;
  }

  const { messages, ...used } = record;

  Object.assign(result, used, { seconds: (Date.now() - started) / 1000 });
  spent += record.cost ?? 0;

  // The conversation, next to the workspace and not in it
  if (messages) await writeFile(path.join(HERE, '.runs', stamp, `${name}.transcript.json`), JSON.stringify(messages, null, 2));

  if (!result.error) {
    try {
      await restore(condition, dir);
      result.score = await score(dir, task, browser, mine);
    } catch (error) {
      result.error = `scoring failed: ${error.message}`;
    }
  }

  results.push(result);
  await save();
  console.log(result.score ? `${result.score.pass ? 'pass' : 'fail'} (${result.score.checks.filter((check) => check.pass).length}/${task.checks.length} checks, ${result.turns} turns, ${result.stop}, $${result.cost.toFixed(2)})` : `error: ${result.error}`);

  if (fatal) {
    console.log(`Stopping: ${fatal.constructor.name}. ${fatal instanceof Anthropic.AuthenticationError ? 'Set ANTHROPIC_API_KEY or run `ant auth login`.' : 'The runs that follow would fail the same way.'}`);
    break;
  }
}

await browser.close();
await close();
await save();
console.log(`\n${summarize(results)}\n\nSpent $${spent.toFixed(2)}. eval/results/${stamp}.json; the workspaces and the conversations are in eval/.runs/${stamp}/`);
