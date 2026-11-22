// A stand-in for the API of the application: data in memory, on a port of
// its own, so that the browser sends every request as a CORS request.
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const PEOPLE = [
  ['Katherine Johnson', 'US', 'vip', 2],
  ['Hedy Lamarr', 'US', 'standard', 1],
  ['Linus Berg', 'GB', 'standard', 1],
  ['Margaret Hamilton', 'US', 'vip', 1],
  ['Niklas Wirth', 'ME', 'standard', 3],
  ['Barbara Liskov', 'US', 'standard', 1],
  ['Cahit Arf', 'TR', 'vip', 2],
  ['Dennis Ritchie', 'US', 'standard', 1],
  ['Edsger Dijkstra', 'GB', 'standard', 1],
  ['Frances Allen', 'US', 'standard', 2],
  ['Guido Rossum', 'GB', 'standard', 1],
  ['Ivan Sutherland', 'US', 'vip', 1],
  ['Jean Bartik', 'US', 'standard', 1],
  ['Ken Thompson', 'US', 'standard', 4],
  ['Leslie Lamport', 'GB', 'standard', 1],
  ['Marija Petrovic', 'ME', 'standard', 2],
  ['Niko Vukovic', 'ME', 'vip', 1],
  ['Ozan Demir', 'TR', 'standard', 1],
  ['Radia Perlman', 'US', 'standard', 1],
  ['Selin Kaya', 'TR', 'standard', 2],
  ['Tim Berners', 'GB', 'vip', 1],
  ['Zeynep Arslan', 'TR', 'standard', 1]
];

const seed = () => [
  { id: 1, name: 'Ada Lovelace', email: 'ada@example.com', country: 'GB', birthDate: '1990-12-10', ticketType: 'vip', interests: ['talks'], tickets: [{ session: 'Opening', quantity: 1 }] },
  { id: 2, name: 'Grace Hopper', email: 'grace@example.com', country: 'US', birthDate: '1986-12-09', ticketType: 'standard', interests: ['workshops', 'talks'], tickets: [{ session: 'Compilers', quantity: 2 }] },
  { id: 3, name: 'Alan Turing', email: 'alan@example.com', country: 'GB', birthDate: '', ticketType: 'standard', interests: [], tickets: [{ session: 'Opening', quantity: 1 }] },
  ...PEOPLE.map(([name, country, ticketType, quantity], index) => ({
    id: index + 4,
    name,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
    country,
    birthDate: ticketType === 'vip' ? '1985-04-12' : '',
    ticketType,
    interests: index % 3 ? ['talks'] : ['workshops', 'networking'],
    tickets: [{ session: index % 2 ? 'Workshop' : 'Opening', quantity }]
  }))
];

const COUNTRIES = [
  { value: 'GB', label: 'United Kingdom' },
  { value: 'ME', label: 'Montenegro' },
  { value: 'TR', label: 'Türkiye' },
  { value: 'US', label: 'United States' }
];

const USER = { email: 'admin@example.com', password: 'secret123' };

/** What a new or changed attendee is refused for, by field. */
const problemsOf = (state, sent, id) => {
  const errors = {};
  const add = (field, message) => (errors[field] = [...(errors[field] ?? []), message]);

  if (!sent.name || String(sent.name).trim().length < 2) add('name', 'Name must be at least 2 characters');
  if (!/^\S+@\S+\.\S+$/.test(sent.email ?? '')) add('email', 'Enter a valid email address');
  else if (state.attendees.some((one) => one.email === sent.email && one.id !== id)) add('email', 'This email is already registered');
  if (!Array.isArray(sent.tickets) || sent.tickets.length === 0) add('tickets', 'Add at least one ticket');

  // A rule about one row of the tickets: named by its index
  (sent.tickets ?? []).forEach((ticket, index) => {
    if (ticket.session === 'Workshop' && Number(ticket.quantity) > 5) {
      add(`tickets.${index}.quantity`, 'The workshop has 5 seats');
    }
  });

  const seats = (sent.tickets ?? []).reduce((sum, ticket) => sum + Number(ticket.quantity ?? 0), 0);

  // A rule that belongs to no field of the form
  if (seats > 10) add('capacity', 'Only 10 seats are left for one attendee');

  return errors;
};

export const startApi = async (port = 0) => {
  const state = { attendees: seed(), nextId: 100, token: 'token-1', hits: {}, uploads: [] };
  const json = (response, status, data) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(data === undefined ? undefined : JSON.stringify(data));
  };

  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const path = url.pathname.replace(/^\/api/, '');
    const route = `${request.method} ${path}`;
    const chunks = [];

    response.setHeader('access-control-allow-origin', request.headers.origin ?? '*');
    response.setHeader('access-control-allow-credentials', 'true');

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-methods': 'GET, POST, PUT, DELETE',
        'access-control-allow-headers': request.headers['access-control-request-headers'] ?? '',
        'access-control-max-age': '600'
      });

      return response.end();
    }

    state.hits[route] = (state.hits[route] ?? 0) + 1;
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const raw = Buffer.concat(chunks);
      const body = () => JSON.parse(raw.toString() || '{}');
      const open = path.startsWith('/auth/') || path.startsWith('/test/');

      if (!open && request.headers.authorization !== `Bearer ${state.token}`) {
        return json(response, 401, { message: 'Your session is over' });
      }

      const one = /^\/attendees\/(\d+)$/.exec(path);
      const badge = /^\/attendees\/(\d+)\/badge$/.exec(path);

      if (route === 'POST /auth/login') {
        const sent = body();

        return sent.email === USER.email && sent.password === USER.password
          ? json(response, 200, { token: state.token, name: 'Admin' })
          : json(response, 401, { message: 'The email or the password is wrong' });
      }

      if (route === 'POST /auth/refresh') {
        state.token = `token-${Number(state.token.split('-')[1]) + 1}`;

        return json(response, 200, { token: state.token });
      }

      // For the tests: what happened, and making things happen
      if (route === 'GET /test/state') return json(response, 200, { hits: state.hits, uploads: state.uploads });
      if (route === 'POST /test/expire-token') {
        state.token = `token-${Number(state.token.split('-')[1]) + 1}`;

        return json(response, 200, {});
      }
      if (route === 'POST /test/reset') {
        Object.assign(state, { attendees: seed(), nextId: 100, hits: {}, uploads: [] });

        return json(response, 200, {});
      }

      if (route === 'GET /countries') return json(response, 200, COUNTRIES);

      if (route === 'GET /attendees/email-available') {
        const email = url.searchParams.get('email');
        const except = Number(url.searchParams.get('except'));

        return setTimeout(
          () => json(response, 200, { available: !state.attendees.some((item) => item.email === email && item.id !== except) }),
          80
        );
      }

      if (route === 'GET /attendees/summary') {
        return json(response, 200, {
          total: state.attendees.length,
          vip: state.attendees.filter((item) => item.ticketType === 'vip').length,
          seats: state.attendees.reduce(
            (sum, item) => sum + item.tickets.reduce((seats, ticket) => seats + Number(ticket.quantity ?? 0), 0),
            0
          ),
          countries: new Set(state.attendees.map((item) => item.country)).size
        });
      }

      if (route === 'GET /attendees') {
        const q = (url.searchParams.get('q') ?? '').toLowerCase();
        const page = Number(url.searchParams.get('page') ?? 1);
        const pageSize = Number(url.searchParams.get('pageSize') ?? 10);
        const found = state.attendees.filter((item) => `${item.name} ${item.email}`.toLowerCase().includes(q));
        const answer = () =>
          json(response, 200, { items: found.slice((page - 1) * pageSize, page * pageSize), total: found.length });

        // A short search is slow, so that a longer one overtakes it
        return q && q.length < 3 ? setTimeout(answer, 400) : answer();
      }

      if (route === 'POST /attendees') {
        const sent = body();
        const errors = problemsOf(state, sent);

        if (Object.keys(errors).length) return json(response, 422, { message: 'The attendee could not be saved', errors });

        const created = { ...sent, id: state.nextId++ };

        state.attendees.unshift(created);

        return json(response, 201, created);
      }

      if (one) {
        const id = Number(one[1]);
        const index = state.attendees.findIndex((item) => item.id === id);

        if (index === -1) return json(response, 404, { message: 'There is no such attendee' });
        if (request.method === 'GET') return json(response, 200, state.attendees[index]);
        if (request.method === 'DELETE') {
          state.attendees.splice(index, 1);
          response.writeHead(204);

          return response.end();
        }
        if (request.method === 'PUT') {
          const sent = body();
          const errors = problemsOf(state, sent, id);

          if (Object.keys(errors).length) return json(response, 422, { message: 'The attendee could not be saved', errors });

          state.attendees[index] = { ...sent, id };

          return json(response, 200, state.attendees[index]);
        }
      }

      if (badge && request.method === 'POST') {
        const type = request.headers['content-type'] ?? '';
        const name = /filename="([^"]+)"/.exec(raw.toString('latin1'))?.[1] ?? null;

        state.uploads.push({ id: Number(badge[1]), type: type.split(';')[0], name, size: raw.length });

        return json(response, 200, { name });
      }

      return json(response, 404, { message: `No ${route}` });
    });
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

  return { server, state, url: `http://127.0.0.1:${server.address().port}/api` };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const api = await startApi(Number(process.env.API_PORT ?? 4500));

  console.log(`API ${api.url}  (sign in as ${USER.email} / ${USER.password})`);
}
