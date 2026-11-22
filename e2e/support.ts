import { expect, type Page } from '@playwright/test';

export const API = 'http://127.0.0.1:4500/api';

/** The native control inside the field with a label; Playwright looks through shadow roots. */
export const field = (page: Page, label: string, selector = 'input') =>
  page.locator(`punica-field[label="${label}"]`).first().locator(selector).first();

/** The heading of the page. */
export const heading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name });

/** What the page logged as an error, besides the failed requests the tests cause on purpose. */
export const watchErrors = (page: Page) => {
  const errors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));

  return errors;
};

/** The requests the page sent to the API, without the preflights of the browser. */
export const watchRequests = (page: Page) => {
  const requests: string[] = [];

  page.on('response', (response) => {
    const request = response.request();

    if (response.url().startsWith(API) && request.method() !== 'OPTIONS') {
      requests.push(`${request.method()} ${response.url().slice(API.length)} ${response.status()}`);
    }
  });

  return requests;
};

export const signIn = async (page: Page) => {
  await page.goto('/login');
  await field(page, 'Email').fill('admin@example.com');
  await field(page, 'Password').fill('secret123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(heading(page, 'Attendees')).toBeVisible();
  // The list has arrived: what a test watches from here on is its own
  await expect(page.getByTestId('total')).toHaveText(/\d+ attendees?/);
};

export const reset = (page: Page) => page.request.post(`${API}/test/reset`);

export const serverState = async (page: Page) =>
  (await (await page.request.get(`${API}/test/state`)).json()) as {
    hits: Record<string, number>;
    uploads: Array<{ id: number; type: string; name: string; size: number }>;
  };
