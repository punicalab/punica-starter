import { expect, test } from '@playwright/test';
import { API, field, heading, reset, serverState, signIn, watchErrors, watchRequests } from './support';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  await reset(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const rows = 'punica-table-body punica-table-row';

test.describe('signing in', () => {
  test('a page of the application sends a visitor to the sign-in page', async ({ page }) => {
    await page.goto('/attendees/1');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the rules of the form are checked before anything is sent', async ({ page }) => {
    const requests = watchRequests(page);

    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();

    await field(page, 'Email').fill('nobody');
    await field(page, 'Email').press('Tab');
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    expect(requests).toEqual([]);
  });

  test('a wrong password is told above the fields, the right one opens the list', async ({ page }) => {
    await page.goto('/login');
    await field(page, 'Email').fill('admin@example.com');
    await field(page, 'Password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('The email or the password is wrong');
    // No toast besides: the form is where the message belongs
    await expect(page.locator('punica-toast')).toHaveCount(0);

    await field(page, 'Password').fill('secret123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator(rows)).toHaveCount(8);
    await expect(page.getByTestId('total')).toHaveText('25 attendees');
    await expect(page.getByTestId('range')).toHaveText('Showing 1–8 of 25');
    // The figures above the list
    await expect(page.getByTestId('stat-attendees')).toHaveText('25');
    await expect(page.getByTestId('stat-vip-tickets')).toHaveText('7');
  });

  test('signing out ends the session', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('the list', () => {
  test.beforeEach(async ({ page }) => signIn(page));

  test('a token that expired is refreshed and the request sent again, unseen', async ({ page }) => {
    const requests = watchRequests(page);

    await page.request.post(`${API}/test/expire-token`);
    await page.locator('punica-pagination').getByRole('button', { name: 'Page 2' }).click();
    await expect(page.locator(rows).first()).toContainText('Barbara Liskov');
    await expect(page.getByTestId('range')).toHaveText('Showing 9–16 of 25');
    expect(requests).toEqual([
      'GET /attendees?page=2&pageSize=8 401',
      'POST /auth/refresh 200',
      'GET /attendees?page=2&pageSize=8 200'
    ]);
    await expect(page.locator('punica-toast')).toHaveCount(0);
  });

  test('a search that was overtaken by a newer one is cancelled', async ({ page }) => {
    const finished: string[] = [];
    const cancelled: string[] = [];

    page.on('requestfinished', (request) => {
      if (request.url().includes('/attendees?') && request.method() === 'GET') finished.push(new URL(request.url()).searchParams.get('q') ?? '');
    });
    page.on('requestfailed', (request) => {
      if (request.url().includes('/attendees?')) cancelled.push(new URL(request.url()).searchParams.get('q') ?? '');
    });

    await page.locator('punica-input[type="search"] input').pressSequentially('gra', { delay: 30 });
    await expect(page.getByTestId('total')).toHaveText('1 attendee');
    await expect(page.locator(rows)).toHaveCount(1);
    await expect(page.locator(rows)).toContainText(['Grace Hopper']);
    await expect(page.locator(rows)).toContainText(['grace@example.com']);
    await expect(page.locator(rows)).toContainText(['United States']);
    // The two it overtook never got their answer; how the rest is timed is
    // the machine's business
    expect(cancelled).toEqual(expect.arrayContaining(['g', 'gr']));
    expect(finished).not.toContain('g');
    expect(finished).not.toContain('gr');
    expect(finished.at(-1)).toBe('gra');
  });

  test('a search that finds nothing says so', async ({ page }) => {
    await page.locator('punica-input[type="search"] input').fill('nobody at all');
    await expect(page.getByText('No attendee matches')).toBeVisible();
  });

  test('an attendee is deleted after the user confirms', async ({ page }) => {
    const row = page.locator(rows, { hasText: 'Alan Turing' });

    await row.getByRole('button', { name: 'Delete Alan Turing' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Delete Alan Turing?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Delete Alan Turing' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('punica-toast')).toContainText('Alan Turing was deleted');
    await expect(row).toHaveCount(0);
    await expect(page.getByTestId('total')).toHaveText('24 attendees');
    // The figures follow
    await expect(page.getByTestId('stat-attendees')).toHaveText('24');
  });

  test('a session that cannot be continued ends at the sign-in page', async ({ page }) => {
    // The server forgets the session and refuses to refresh it
    await page.route(`${API}/auth/refresh`, (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"message":"Sign in again"}' })
    );
    await page.request.post(`${API}/test/expire-token`);
    await page.locator('punica-pagination').getByRole('button', { name: 'Page 2' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Your session is over. Sign in again.')).toBeVisible();
  });
});

test.describe('the form of an attendee', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: 'New attendee' }).click();
    await expect(heading(page, 'New attendee')).toBeVisible();
  });

  const choose = async (page: import('@playwright/test').Page, label: string, option: string) => {
    const select = page.locator(`punica-field[label="${label}"]`).first().locator('punica-select');

    await select.click();
    await select.locator('punica-option', { hasText: option }).click();
  };

  test('the countries are asked for once, however often the form is opened', async ({ page }) => {
    const country = page.locator('punica-field[label="Country"] punica-select');

    await expect(country.locator('punica-option')).toHaveCount(4);
    await page.getByRole('button', { name: 'Back to the list' }).click();
    await page.getByRole('button', { name: 'New attendee' }).click();
    await expect(page.locator('punica-field[label="Country"] punica-select punica-option')).toHaveCount(4);

    expect((await serverState(page)).hits['GET /countries']).toBe(1);
  });

  test('an email that is taken is found while the user types, with one request', async ({ page }) => {
    const requests = watchRequests(page);

    await field(page, 'Email').pressSequentially('ada@example.com', { delay: 15 });
    await field(page, 'Email').press('Tab');
    await expect(page.getByText('This email is already registered')).toBeVisible();
    expect(requests.filter((one) => one.includes('email-available'))).toEqual([
      'GET /attendees/email-available?email=ada%40example.com 200'
    ]);

    await field(page, 'Email').fill('new@example.com');
    await field(page, 'Email').press('Tab');
    await expect(page.getByText('This email is already registered')).toHaveCount(0);
  });

  test('a rule about two fields comes from the schema', async ({ page }) => {
    await page.locator('punica-radio', { hasText: 'VIP' }).click();
    await page.getByRole('button', { name: 'Create attendee' }).click();
    await expect(page.getByText('A VIP ticket needs a date of birth', { exact: true })).toBeVisible();

    await page.locator('punica-radio', { hasText: 'Standard' }).click();
    await page.getByRole('button', { name: 'Create attendee' }).click();
    await expect(page.getByText('A VIP ticket needs a date of birth', { exact: true })).toHaveCount(0);
  });

  test('an attendee is created with tickets and a badge, and is in the list', async ({ page }) => {
    const requests = watchRequests(page);

    await field(page, 'Name').fill('Katherine Johnson');
    await field(page, 'Email').fill('k.johnson@example.com');
    await choose(page, 'Country', 'United States');
    await page.locator('punica-radio', { hasText: 'VIP' }).click();
    await page.locator('punica-date-picker input').fill('08/26/1988');
    await page.locator('punica-date-picker input').press('Tab');

    // A second ticket, and the first one changed
    await page.getByRole('button', { name: 'Add ticket' }).click();
    await expect(page.locator('punica-field[label="Session"]')).toHaveCount(2);
    await page.locator('punica-field[label="Session"]').nth(1).locator('punica-select').click();
    await page.locator('punica-field[label="Session"]').nth(1).locator('punica-option', { hasText: 'Workshop' }).click();
    await page.locator('punica-field[label="Quantity"]').nth(1).locator('input').fill('3');
    // Beside the form, what it holds so far
    await expect(page.getByTestId('summary-name')).toHaveText('Katherine Johnson');
    await expect(page.getByTestId('summary-seats')).toHaveText('4');

    await page.locator('punica-file-input input[type="file"]').setInputFiles({
      name: 'badge.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not really a picture')
    });

    await page.getByRole('button', { name: 'Create attendee' }).click();
    await expect(page.locator('punica-toast')).toContainText('Katherine Johnson was saved');
    await expect(page.locator(rows).first()).toContainText('Katherine Johnson');
    await expect(page.locator(rows).first()).toContainText('VIP');

    expect(requests.filter((one) => /^(POST|PUT)/.test(one))).toEqual([
      'POST /attendees 201',
      'POST /attendees/100/badge 200'
    ]);
    expect((await serverState(page)).uploads).toEqual([
      expect.objectContaining({ id: 100, type: 'multipart/form-data', name: 'badge.png' })
    ]);

    // What was saved comes back into the form
    await page.getByRole('link', { name: 'Katherine Johnson' }).first().click();
    await expect(field(page, 'Name')).toHaveValue('Katherine Johnson');
    await expect(page.locator('punica-field[label="Session"]')).toHaveCount(2);
    await expect(page.locator('punica-field[label="Quantity"]').nth(1).locator('input')).toHaveValue('3');
  });

  test('what the server refuses is shown on the fields it is about, the rest above them', async ({ page }) => {
    // Past the checks of the form: the email is taken by the time it is saved,
    // and the seats are a rule only the server knows
    await page.route(`${API}/attendees/email-available*`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"available":true}' })
    );

    await field(page, 'Name').fill('Second Ada');
    await field(page, 'Email').fill('ada@example.com');
    await choose(page, 'Country', 'Montenegro');
    await page.locator('punica-field[label="Quantity"] input').fill('10');
    await page.getByRole('button', { name: 'Add ticket' }).click();
    await page.locator('punica-field[label="Session"]').nth(1).locator('punica-select').click();
    await page.locator('punica-field[label="Session"]').nth(1).locator('punica-option', { hasText: 'Closing' }).click();
    await page.locator('punica-field[label="Quantity"]').nth(1).locator('input').fill('5');
    await page.getByRole('button', { name: 'Create attendee' }).click();

    await expect(page.locator('punica-field[label="Email"]')).toContainText('This email is already registered');
    await expect(page.getByRole('alert').first()).toHaveText('Only 10 seats are left for one attendee');
    await expect(heading(page, 'New attendee')).toBeVisible();
    await expect(page.locator('punica-toast')).toHaveCount(0);

    // Corrected, it is saved
    await field(page, 'Email').fill('second@example.com');
    await page.locator('punica-field[label="Quantity"]').nth(1).locator('input').fill('0');
    await page.locator('punica-field[label="Quantity"]').nth(1).locator('input').fill('1');
    await page.locator('punica-field[label="Quantity"]').first().locator('input').fill('2');
    await page.getByRole('button', { name: 'Create attendee' }).click();
    await expect(page.locator('punica-toast')).toContainText('Second Ada was saved');
  });

  test('a server that cannot be reached is told above the fields, and the form stays', async ({ page }) => {
    await field(page, 'Name').fill('Nobody Home');
    await field(page, 'Email').fill('nobody@example.com');
    await choose(page, 'Country', 'Türkiye');
    await page.route(`${API}/attendees`, (route) => route.abort('connectionrefused'));
    await page.getByRole('button', { name: 'Create attendee' }).click();

    await expect(page.getByRole('alert').first()).toHaveText(
      'The server could not be reached. Check your connection and try again.'
    );
    await expect(field(page, 'Name')).toHaveValue('Nobody Home');
  });

  test('leaving a form that was changed asks first; an untouched one just leaves', async ({ page }) => {
    await page.getByRole('button', { name: 'Back to the list' }).click();
    await expect(heading(page, 'Attendees')).toBeVisible();

    await page.getByRole('button', { name: 'New attendee' }).click();
    await field(page, 'Name').fill('Half done');
    await page.getByRole('button', { name: 'Back to the list' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Leave without saving?' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(field(page, 'Name')).toHaveValue('Half done');

    await page.getByRole('button', { name: 'Back to the list' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Leave' }).click();
    await expect(heading(page, 'Attendees')).toBeVisible();
  });
});

test.describe('editing', () => {
  test('an attendee is changed: its own email is not "taken", a ticket is removed', async ({ page }) => {
    await signIn(page);

    const requests = watchRequests(page);

    await page.getByRole('button', { name: 'Edit Grace Hopper' }).click();
    await expect(heading(page, 'Grace Hopper')).toBeVisible();
    await expect(field(page, 'Email')).toHaveValue('grace@example.com');
    await expect(page.locator('punica-field[label="Quantity"] input')).toHaveValue('2');

    await field(page, 'Email').focus();
    await field(page, 'Email').press('Tab');
    await field(page, 'Name').fill('Grace B. Hopper');
    await page.getByRole('button', { name: 'Add ticket' }).click();
    await expect(page.locator('punica-field[label="Session"]')).toHaveCount(2);
    await page.getByRole('button', { name: /Remove/ }).last().click();
    await expect(page.locator('punica-field[label="Session"]')).toHaveCount(1);

    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.locator('punica-toast')).toContainText('Grace B. Hopper was saved');
    await expect(page.locator(rows, { hasText: 'Grace B. Hopper' })).toBeVisible();
    expect(requests.some((one) => one.includes('email-available'))).toBe(false);
    expect(requests).toContain('PUT /attendees/2 200');
  });

  test('an attendee that is not there says so', async ({ page }) => {
    await signIn(page);
    await page.goto('/attendees/999');
    await expect(page.getByText('This attendee is not here')).toBeVisible();
    await page.getByRole('link', { name: 'Back to the list' }).click();
    await expect(heading(page, 'Attendees')).toBeVisible();
    // The client told the user as well; that message is the server's
    await expect(page.locator('punica-toast')).toContainText('There is no such attendee');
  });
});
