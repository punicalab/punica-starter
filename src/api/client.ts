// The one client of the application. Whatever holds for every request is a
// middleware in this list; a page only says what it wants.
import { createClient, deleteCookie, getCookie, setCookie, when } from '@punica/request';
import { fetchAdapter } from '@punica/request-fetch';
import { cache, cancel, onError, refreshToken, StorageSession, tokenAuth } from '@punica/request-middleware';
import { notify } from '../lib/notify';

declare module '@punica/request' {
  interface RequestOptions {
    /** The caller deals with a failure itself: no message is shown. */
    silent?: boolean;
  }
}

/** What a failed response of the API holds. */
export interface ApiError {
  message: string;
  /** Messages by field, for a request that was refused for what it held. */
  errors?: Record<string, string[]>;
}

const TOKEN = 'starter_token';

export const session = {
  get token() {
    return getCookie(TOKEN);
  },
  start(token: string) {
    setCookie(TOKEN, token, { path: '/', sameSite: 'Lax' });
  },
  end() {
    deleteCookie(TOKEN, { path: '/' });
  }
};

/** Called when the session cannot be continued; the application goes to the sign-in page. */
let onSessionOver = () => undefined as void;

export const whenSessionIsOver = (handler: () => void) => {
  onSessionOver = handler;
};

/** Cancels a search when a newer one is made. */
export const latestSearch = cancel();

export const api = createClient({
  baseURL: import.meta.env.VITE_API_URL,
  adapter: fetchAdapter(),
  headers: { Accept: 'application/json' },
  timeout: 10_000,
  middlewares: [
    // First: it sees the response the caller gets, after a token was refreshed
    onError({
      401: (_response, context) => {
        // A wrong password is the business of the sign-in form
        if (context.url.pathname.endsWith('/auth/login')) return;

        session.end();
        onSessionOver();
      },
      default: (response, context) => {
        if (context.options.silent) return;

        notify((response.data as ApiError | undefined)?.message ?? `Something went wrong (${response.status})`, 'error');
      }
    }),
    // Before tokenAuth: the request it sends again takes the new token
    refreshToken({
      refresh: async () => {
        const { data } = await api.post<{ token: string }>('auth/refresh', { silent: true });

        session.start(data.token);
      },
      exclude: (context) => context.url.pathname.includes('/auth/')
    }),
    tokenAuth({ cookieName: TOKEN }),
    cache({ storage: new StorageSession({ prefix: 'starter:' }) }),
    when((context) => context.method === 'GET' && context.url.pathname.endsWith('/attendees'), latestSearch)
  ]
});
