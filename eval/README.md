# The eval

What does it cost an assistant to build the same two screens on Punica and
on a mainstream stack, and does what it builds work?

```sh
cd eval && npm install
node run.mjs              # the plan and its estimated cost; nothing is called
node run.mjs --prepare    # installs the two stacks under .stacks/
node run.mjs --yes        # runs it: this calls a model and costs money
```

`--yes` needs `ANTHROPIC_API_KEY` or `ant auth login`. Before anything is
paid for it counts the prompt of every condition, which costs nothing; it
stops once the budget it printed is spent (`--budget 10`), and writes the
results after every run. The estimate rests on assumed turns and sizes: run
one repetition first (`--reps 1`) and read the real ones.

## What is compared

| Condition | Stack | What the model is given |
| --- | --- | --- |
| `mainstream` | React Hook Form + Zod, axios, TanStack Query, MUI | Nothing to read: models know these |
| `punica-guides` | Punica | The guides of the three MCP servers in the prompt, their lookup tools, the full `get_component` |
| `punica-agents` | Punica | `AGENTS.md` of this repository in the prompt, the bridge (`src/lib/formRequest.ts`) in the workspace, the lookup tools, `get_component` with `brief` |

Every condition starts from the same empty scaffold (`workspaces/`): the
providers, the routes and placeholder pages. The model reads and writes
files and may run the type check; it has no browser, and it cannot change
the files a run is scored with (`package.json`, `tsconfig.json`,
`vite.config.ts`).

## The tasks (`tasks.mjs`)

- `form`: a form with rows that shows what the server refuses, at the field,
  at the row and above the form.
- `list`: signing in, a list that is searched while slower answers arrive
  late, deleting after a confirmation, and a token that is renewed once.

## How a run is scored

The type check, a production build, the validators of the three libraries
(Punica conditions), and the checks of the task in Chromium against the
stand-in API of this repository. The checks find fields by label, buttons
by name and messages by text, so one set of checks serves both stacks; a
hand-written solution on each stack passes all of them.

Reported per condition: runs that passed, checks passed, turns, tokens read
and written, cost and time. A conversation that was cut short (the token
limit of a turn, the turn limit, a declined request) is counted apart, not
as a failure of the stack. `results/` keeps the numbers, `.runs/` the
workspaces the model left and the conversations.

`node run.mjs --check <dir> --task form` scores a workspace without calling
a model.

## What it does not show

- Two tasks and a few repetitions are a small sample: read differences of a
  run or two as noise.
- The tasks are of the kind `AGENTS.md` and the bridge were written for: a
  form that shows what the server refuses, a client that renews a token.
  That is what they are for, but a screen outside those would be a harder
  test.
- `punica-agents` differs from `punica-guides` in three things at once (the
  guide, the bridge, the brief lookup): the numbers do not say which one
  did what.
- The mainstream stack gets no guide because it needs none; that is the
  point being measured, not an oversight.
- Later repetitions of a condition may read its prompt from the cache the
  first one wrote, which makes them a little cheaper.
