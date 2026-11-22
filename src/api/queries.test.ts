import { createClient, HttpError, RequestError } from '@punica/request';
import type { RequestContext } from '@punica/request';
import { describe, expect, it, vi } from 'vitest';

// The client reads its address from the environment of the page
vi.stubEnv('VITE_API_URL', 'https://api.test');
vi.mock('../lib/notify', () => ({ notify: () => undefined }));

const { queryClient } = await import('./queries');

type Retry = (failures: number, error: unknown) => boolean;

const retry = queryClient.getDefaultOptions().queries?.retry as Retry;
const context = { method: 'GET', url: new URL('https://api.test/x') } as RequestContext;
const failed = (status: number) =>
  new HttpError({ ok: false, status, headers: new Headers(), data: undefined }, context);

describe('which failed queries are asked for again', () => {
  it.each([400, 401, 404, 422, 500, 503])('a response with status %i is an answer: not again', (status) => {
    expect(retry(0, failed(status))).toBe(false);
  });

  it('a request that brought no response gets two more tries', () => {
    for (const reason of ['network', 'timeout'] as const) {
      const error = new RequestError(reason, context);

      expect(retry(0, error)).toBe(true);
      expect(retry(1, error)).toBe(true);
      expect(retry(2, error)).toBe(false);
    }
  });

  it('a request that was cancelled is over', () => {
    expect(retry(0, new RequestError('abort', context))).toBe(false);
  });

  it('a mistake of the code is not tried again', () => {
    expect(retry(0, new TypeError('a bug'))).toBe(false);
  });

  it('recognises the errors a client of the library really throws', async () => {
    const api = createClient({ baseURL: 'https://api.test', adapter: async () => Response.json({}, { status: 500 }) });
    const offline = createClient({
      baseURL: 'https://api.test',
      adapter: async () => {
        throw new TypeError('Failed to fetch');
      }
    });

    expect(retry(0, await api.get('x').catch((error) => error))).toBe(false);
    expect(retry(0, await offline.get('x').catch((error) => error))).toBe(true);
  });
});
