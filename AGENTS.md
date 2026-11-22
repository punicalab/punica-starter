# Building with Punica Form, Punica Request and Punica Components

For an assistant (or a person) who adds to this application or starts one
like it. The three libraries are made to be used together; this is how, in
one place. The examples are shortened from the files they name.

Look names up, do not guess them: `.mcp.json` sets up the MCP server of each
library (`get_guide`, `search_api` / `get_api`, `get_component` with
`brief: true`, and a checker for the code you write).

## Who does what

| | Does | Here |
| --- | --- | --- |
| `@punica/request` | Sends requests; what holds for all of them is a middleware | `src/api/client.ts` |
| TanStack Query | Keeps what came back: loading, failed, cached, stale | `src/api/queries.ts` |
| `@punica/form` + `-kit` | A form as a class: fields, rules, state; rendered by the kit | `src/forms/*.ts` |
| `@punica/components` | The elements (`punica-*`) the kit and the pages are made of | `src/pages/*.tsx` |

## One client

```ts
// src/api/client.ts
export const api = createClient({
  baseURL: import.meta.env.VITE_API_URL,
  adapter: fetchAdapter(),
  middlewares: [
    onError({ 401: endSession, default: showMessage }), // first: sees what the caller gets
    refreshToken({ refresh, exclude: isAuthRequest }), // before tokenAuth
    tokenAuth({ cookieName: 'starter_token' })
  ]
});
```

- A response outside 2xx **rejects** with an `HttpError` (`error.status`,
  `error.response.data`); no response at all rejects with a `RequestError`
  (`error.reason`). Tell them apart with `isHttpError` / `isRequestError`.
- `silent: true` on a request (an option this application adds to
  `RequestOptions`) keeps `onError` from showing a message, for callers that
  show the failure themselves: every form does.
- Operations are typed functions that return `response.data`
  (`src/api/attendees.ts`). Bodies go in `json`, queries in `query`.

## Server state

```ts
// src/api/queries.ts
list: (q: string, page: number) =>
  queryOptions({
    queryKey: ['attendees', 'list', { q, page }],
    queryFn: ({ signal }) => listAttendees(q, page, signal), // the signal cancels the request
    placeholderData: keepPreviousData
  });
```

- Pages use `useQuery(queries.x())` and `useMutation`; no `useEffect` that
  fetches, no loading flags of their own.
- A mutation invalidates `queries.attendees` afterwards.
- Retries follow the errors: never for an `HttpError`, twice for a
  `RequestError` that is not an abort.
- No `cache` or `cancel` middleware in the client: the query layer does both.

## A form

```ts
// src/forms/attendee.ts
@Schema(Rules) // a rule about two fields, from a Zod schema
@FormKit({ columns: 2, services: [SchemaValidation] })
class AttendeeForm {
  @TextField({
    label: 'Email',
    required: true,
    validateDebounce: 300,
    validation: async ({ formItem }, context) => {
      const free = await isEmailAvailable(String(formItem.value), id, context?.signal);

      return free ? { error: false } : { error: true, errorMessages: ['This email is already registered'] };
    }
  })
  email = '';

  @SelectField({ label: 'Country', options: () => queryClient.ensureQueryData(queries.countries()) })
  country = '';

  @ArrayField({ label: 'Tickets', row: () => new TicketForm(), minItems: 1 })
  tickets: TicketForm[] = [];
}
```

- Only properties with an initial value are fields. `"experimentalDecorators": true`.
- A rule the kit has (`required`, `minLength`, `pattern`, `min`, …) is an
  option of the field; one about several fields is a schema; one only the
  server knows is the next section.
- A validation that asks the server passes `context.signal` to the request
  and sets `validateDebounce`.
- Choices that come from the server: `options` is a function that returns a
  promise.
- Render with `<KitForm entity={() => new Form()} onSubmit={…} />`, or
  `useFormController` + `<FormView controller={…} />` when the page needs
  the controller (`src/pages/AttendeeForm.tsx`: `useFormState(controller).dirty`).

## What the server refuses

```tsx
// src/pages/AttendeeForm.tsx
<FormView
  controller={controller}
  onSubmit={async (values) => {
    const saved = await submitTo(controller, () => saving.mutateAsync(values));

    navigate('/');
  }}
  onError={() => undefined} // the form shows the message
/>
```

`submitTo` (`src/lib/formRequest.ts`) turns a 400 or 422 with
`{ errors: { email: ['…'], 'tickets.1.quantity': ['…'], capacity: ['…'] } }`
into errors on the fields they name, through the `SetErrors` service of the
form, and throws the rest; what a submit handler throws is shown above the
fields. Do not write items yourself and do not keep a `submitting` flag.

## Pages

- Elements are custom elements: attributes are kebab-case, events are
  `punica-*` (`onpunica-input`, `onpunica-change`), data is in
  `event.detail`. `import type {} from '@punica/components/react'` types
  them in JSX.
- `toast()` for a short message (`src/lib/notify.ts`), `confirm()` before
  something that cannot be undone.
- Colours and spacing come from the `--punica-*` tokens (`src/styles.css`).
- The heading of a page is a native `<h1>`; see "Tests".

## Tests

- `npm test`: unit tests (the bridge, the retry rule). `npm run e2e`: the
  application in a browser against the stand-in API (`server/index.mjs`),
  with an accessibility scan in both colour schemes.
- The elements carry their roles through `ElementInternals`: Playwright's
  `getByRole` and axe do not read those yet. Find `punica-table-row`,
  `punica-field[label="…"]` by tag; roles of native elements inside
  (`button`, `alertdialog`, `link`) work as usual.
- `npx punica-components validate src` checks the markup.

## Adding a screen

1. The operations in `src/api/`, the queries in `src/api/queries.ts`.
2. A form class in `src/forms/` when the screen takes input.
3. The page in `src/pages/`, a route in `src/App.tsx`.
4. A browser test in `e2e/`, and the server's side in `server/index.mjs`.
