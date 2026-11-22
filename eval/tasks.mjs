// The two screens every condition builds, and how a browser tells whether
// they work. The checks know nothing about the stack: they find fields by
// their label, buttons by their name and messages by their text.

const API_NOTES = `The API is at \`import.meta.env.VITE_API_URL\` (JSON in, JSON out). Every request except those under /auth needs \`Authorization: Bearer <token>\`; without a valid token it answers 401 \`{ "message": "Your session is over" }\`.

- \`POST /auth/login\` \`{ email, password }\` → 200 \`{ token, name }\`, or 401 \`{ message }\`.
- \`POST /auth/refresh\` (no body) → 200 \`{ token }\`: a new token; the old one stops working.
- \`GET /attendees?q=&page=1&pageSize=10\` → 200 \`{ items: Attendee[], total }\`. A short \`q\` answers slowly.
- \`POST /attendees\` with an attendee without \`id\` → 201 the attendee, or 422 \`{ message, errors }\` where \`errors\` maps a field to its messages: \`{ "email": ["…"], "tickets.1.quantity": ["…"], "capacity": ["…"] }\`. \`tickets.1.quantity\` is the quantity of the second ticket; \`capacity\` is no field of the form.
- \`DELETE /attendees/:id\` → 204.

\`\`\`ts
interface Attendee {
  id: number;
  name: string;
  email: string;
  country: string; // '' when unknown
  birthDate: string; // '' when unknown
  ticketType: 'standard' | 'vip';
  interests: string[];
  tickets: Array<{ session: string; quantity: number }>;
}
\`\`\``;

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The native control of the field with a label, whatever it is made of: a
 * custom element that takes its label as an attribute keeps the control in
 * its shadow root, anything else is found the way a screen reader finds it.
 */
function control(page, label, nth = 0) {
  return page
    .locator(`[label="${label}"]`)
    .locator('input, textarea')
    .or(page.getByLabel(new RegExp(`^${escape(label)}\\b`)).and(page.locator('input, textarea')))
    .nth(nth);
}

const button = (page, name) => page.getByRole('button', { name, exact: true });
const text = (page, message) => page.getByText(message, { exact: false }).first();

async function fill(page, label, value, nth = 0) {
  const input = control(page, label, nth);

  await input.fill(String(value));
  await input.blur();
}

export const tasks = [
  {
    id: 'form',
    title: 'A form with rows, and what the server refuses',
    prompt: `Write the page at \`/attendees/new\` (\`src/pages/NewAttendee.tsx\`, and whatever other files you need): a form that registers an attendee.

- Fields, with exactly these labels: "Name", "Email", and a list of tickets. Each ticket is a row with "Session" (text) and "Quantity" (a number). The form starts with one ticket of quantity 1. A button named "Add ticket" adds a row.
- A button named "Create attendee" submits. Nothing is sent while the name is shorter than 2 characters or the email is not an email address; the form says what is wrong.
- Submitting sends \`POST /attendees\` with \`country: ''\`, \`birthDate: ''\`, \`ticketType: 'standard'\`, \`interests: []\` and the tickets, quantities as numbers. The token is in \`localStorage\` under \`token\`.
- When the server answers 422, every message is shown: at the field it names (a row's field for \`tickets.N.quantity\`), and above or below the form for a key that is no field. A message goes away once the server no longer sends it.
- After the attendee is created, go to \`/\`.

${API_NOTES}`,
    async before(page, api) {
      const { token } = await (await page.request.post(`${api}/auth/login`, { data: { email: 'admin@example.com', password: 'secret123' } })).json();

      await page.addInitScript((value) => localStorage.setItem('token', value), token);
      await page.goto('/attendees/new');
      await button(page, 'Create attendee').waitFor();

      return token;
    },
    checks: [
      {
        name: 'nothing is sent while the form is invalid',
        async run({ page, hits }) {
          // A button that cannot be pressed yet keeps the rule as well
          if (await button(page, 'Create attendee').isEnabled()) await button(page, 'Create attendee').click();

          await page.waitForTimeout(600);

          if ((await hits())['POST /attendees']) throw new Error('POST /attendees was sent for an empty form');
        }
      },
      {
        name: "the server's message for a field is shown, and a corrected form is saved",
        async run({ page, api, token }) {
          await fill(page, 'Name', 'Eval Person');
          await fill(page, 'Email', 'ada@example.com');
          await fill(page, 'Session', 'Opening');
          await button(page, 'Create attendee').click();
          await text(page, 'This email is already registered').waitFor();
          await fill(page, 'Email', 'eval.person@example.com');
          await button(page, 'Create attendee').click();
          await page.waitForURL((url) => url.pathname === '/');

          const found = await (await page.request.get(`${api}/attendees?q=eval.person`, { headers: { authorization: `Bearer ${token}` } })).json();
          const saved = found.items[0];

          if (!saved) throw new Error('the attendee is not on the server');
          if (saved.tickets?.[0]?.session !== 'Opening' || saved.tickets[0].quantity !== 1) throw new Error(`tickets were sent as ${JSON.stringify(saved.tickets)}`);
          if (saved.ticketType !== 'standard' || !Array.isArray(saved.interests)) throw new Error('the fixed values were not sent');
        }
      },
      {
        name: 'a message about one row and one about no field are shown, and go away',
        async run({ page }) {
          await fill(page, 'Name', 'Row Person');
          await fill(page, 'Email', 'row.person@example.com');
          await fill(page, 'Session', 'Opening');
          await button(page, 'Add ticket').click();
          await fill(page, 'Session', 'Workshop', 1);
          await fill(page, 'Quantity', 6, 1);
          await button(page, 'Create attendee').click();
          await text(page, 'The workshop has 5 seats').waitFor();
          await fill(page, 'Quantity', 5, 1);
          await fill(page, 'Quantity', 9, 0);
          await button(page, 'Create attendee').click();
          await text(page, 'Only 10 seats are left for one attendee').waitFor();

          await page
            .getByText('The workshop has 5 seats')
            .first()
            .waitFor({ state: 'hidden', timeout: 3000 })
            .catch(() => {
              throw new Error('the message of the row stayed after the server stopped sending it');
            });
        }
      }
    ]
  },
  {
    id: 'list',
    title: 'Signing in, a list that is searched, and a session that is renewed',
    prompt: `Write the pages at \`/login\` and \`/\` (\`src/pages/Login.tsx\`, \`src/pages/Attendees.tsx\`, and whatever other files you need).

- \`/login\`: fields labelled "Email" and "Password" and a button named "Sign in". A wrong password shows the server's message. Signing in goes to \`/\`.
- \`/\` without a session goes to \`/login\`.
- \`/\` shows the first ten attendees, each in an element with \`data-testid="attendee"\` that shows the name, and the number the server reports in an element with \`data-testid="total"\`, as "25 attendees" ("1 attendee" for one).
- A field labelled "Search" filters by the server's \`q\` as the user types. The list always shows the answer to what the field holds now, also when an earlier, slower answer arrives later.
- Each attendee has a button named "Delete". It asks first, in a dialog with a button named "Confirm"; after that the attendee is deleted and the list and the total are current again.
- When a request is answered 401 because the token is no longer valid, the application asks \`POST /auth/refresh\` for a new one, once, and sends the request again; the user notices nothing.

${API_NOTES}`,
    async before(page) {
      await page.goto('/login');
      await button(page, 'Sign in').waitFor();
    },
    checks: [
      {
        name: 'a page without a session goes to the sign-in',
        async run({ page }) {
          await page.goto('/');
          await button(page, 'Sign in').waitFor();
        }
      },
      {
        name: 'a wrong password shows what the server says',
        async run({ page }) {
          await fill(page, 'Email', 'admin@example.com');
          await fill(page, 'Password', 'wrong');
          await button(page, 'Sign in').click();
          await text(page, 'The email or the password is wrong').waitFor();
        }
      },
      {
        name: 'signing in shows ten attendees and the total',
        async run({ page }) {
          await signIn(page);

          const count = await page.getByTestId('attendee').count();

          if (count !== 10) throw new Error(`${count} attendees are shown`);
        }
      },
      {
        name: 'the list shows the answer to the latest search',
        async run({ page }) {
          await signIn(page);

          const search = control(page, 'Search');

          await search.pressSequentially('a');
          await page.waitForTimeout(60);
          await search.pressSequentially('da');
          await page.waitForTimeout(1200);

          const rows = page.getByTestId('attendee');

          if ((await rows.count()) !== 1) throw new Error(`${await rows.count()} attendees are shown for "ada"`);
          if (!(await rows.first().innerText()).includes('Ada Lovelace')) throw new Error('the attendee shown is not Ada Lovelace');
        }
      },
      {
        name: 'an attendee is deleted after a confirmation',
        async run({ page, hits }) {
          await signIn(page);
          await page.getByTestId('attendee').first().getByRole('button', { name: /^Delete/ }).click();
          await page.waitForTimeout(300);

          if (Object.keys(await hits()).some((route) => route.startsWith('DELETE'))) throw new Error('deleted without asking');

          await button(page, 'Confirm').click();
          await page.getByTestId('total').getByText('24 attendees').waitFor();
        }
      },
      {
        name: 'an expired token is renewed once and the request is sent again',
        async run({ page, api, hits }) {
          await signIn(page);
          await page.request.post(`${api}/test/expire-token`);
          await control(page, 'Search').fill('grace');
          await page.getByTestId('total').getByText('1 attendee').waitFor();

          const refreshes = (await hits())['POST /auth/refresh'];

          if (refreshes !== 1) throw new Error(`POST /auth/refresh was sent ${refreshes ?? 0} times`);
          if (!(await page.getByTestId('attendee').first().innerText()).includes('Grace Hopper')) throw new Error('the list is not the answer to "grace"');
        }
      }
    ]
  }
];

async function signIn(page) {
  await fill(page, 'Email', 'admin@example.com');
  await fill(page, 'Password', 'secret123');
  await button(page, 'Sign in').click();
  await page.getByTestId('total').getByText('25 attendees').waitFor();
}
