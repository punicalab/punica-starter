# Punica Starter

A small application on three libraries that are made to be used together:

- [Punica Form](https://form.punicalab.com): the forms, their rules and their state
- [Punica Request](https://request.punicalab.com): the requests and what holds for all of them
- [Punica Components](https://components.punicalab.com): what the user sees

It signs a user in, lists attendees with a search, and creates, edits and
deletes them, against a stand-in API that runs beside it.

```bash
npm install
npm run dev        # the API on :4500 and the application on http://localhost:5173
```

Sign in as `admin@example.com` / `secret123`.

| Command | |
| --- | --- |
| `npm run dev` | The stand-in API and the application, reloading |
| `npm run build` | Type-checks and builds |
| `npm test` | Unit tests of the bridge between forms and requests |
| `npm run e2e` | The application in a browser, against the production build |

## Where things are

| | |
| --- | --- |
| [`src/api/client.ts`](./src/api/client.ts) | The one client. What holds for every request is a middleware in its list: failures are told to the user (`onError`), an expired token is refreshed (`refreshToken`), the token goes along (`tokenAuth`) |
| [`src/api/queries.ts`](./src/api/queries.ts) | What comes from the server, kept by [TanStack Query](https://tanstack.com/query): loading and failed states, a cache the pages share, requests that are cancelled when nobody waits for them, and which failures are worth another try |
| [`src/api/attendees.ts`](./src/api/attendees.ts) | The operations: typed functions that say what they want and nothing else |
| [`src/forms/attendee.ts`](./src/forms/attendee.ts) | The form of an attendee as a class: its fields, their rules, a list of rows, choices loaded from the API, an email checked with the server while the user types, a rule about two fields from a Zod schema |
| [`src/lib/formRequest.ts`](./src/lib/formRequest.ts) | The bridge: what the server refuses is shown on the fields it is about |
| [`src/pages`](./src/pages) | The three pages |
| [`server/index.mjs`](./server/index.mjs) | The stand-in API |

## Requests and their state

Punica Request sends; it does not keep what came back. The pages get that
from TanStack Query, and the two fit without glue:

```ts
queryOptions({
  queryKey: ['attendees', 'list', { q, page }],
  // The signal of the query cancels the request: a search that was
  // overtaken by a newer one never arrives
  queryFn: ({ signal }) => listAttendees(q, page, signal)
});
```

The errors of the client say what is worth another try: an `HttpError` is an
answer, whatever its status, and is not asked for again; a `RequestError`
(offline, too slow) is, twice. After a change a mutation invalidates
`['attendees']`, and the list and the figures above it follow.

An application without a query layer has the `cache` and `cancel`
middlewares of Punica Request for the same two jobs.

## The bridge between a form and a request

A form checks what it can; the server has the last word. `submitTo` sends
what a form was submitted with and, when the server refuses it with messages
by field (`{ errors: { email: ["…"] } }`, status 400 or 422), puts each
message on its field. Messages that belong to no field, and requests that
brought no response, are shown above the fields.

```tsx
<FormView
  controller={controller}
  onSubmit={async (values) => {
    const saved = await submitTo(controller, () => saveAttendee(values));

    navigate(`/attendees/${saved.id}`);
  }}
/>
```

The form lists the `ServerErrors` service
(`@FormKit({ services: [ServerErrors] })`); the request is made with
`silent: true`, an option of this application that keeps the client from
showing its own message.

## Working with an AI assistant

[`.mcp.json`](./.mcp.json) sets up the MCP servers of the three libraries.
An assistant that opens this folder looks their APIs up and checks the code
it writes instead of guessing.

## Good to know

- The elements of Punica Components carry their roles through
  `ElementInternals`. Screen readers read them; axe and Playwright's
  `getByRole` do not yet. The pages therefore use a native `<h1>`, and the
  tests find a `punica-table-row` by its tag.
- The form classes use decorators: `"experimentalDecorators": true` in
  `tsconfig.json`.
