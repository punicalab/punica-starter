// The state of what comes from the server: loading, failed, stale, shared
// between the pages. TanStack Query keeps it; the client only sends.
import { keepPreviousData, QueryClient, queryOptions } from '@tanstack/react-query';
import { isHttpError, isRequestError } from '@punica/request';
import { getAttendee, getSummary, listAttendees, listCountries } from './attendees';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A response is an answer, whatever its status: asking again changes
      // nothing. A request that brought none (offline, too slow) is worth
      // two more tries; one that was cancelled is over.
      retry: (failures, error) =>
        !isHttpError(error) && isRequestError(error) && error.reason !== 'abort' && failures < 2
    }
  }
});

/** Everything about attendees: one prefix to invalidate after a change. */
const attendees = ['attendees'] as const;

export const queries = {
  attendees,
  /** A page of the list. The signal of the query cancels its request: a search that was overtaken never arrives. */
  list: (q: string, page: number) =>
    queryOptions({
      queryKey: [...attendees, 'list', { q, page }],
      queryFn: ({ signal }) => listAttendees(q, page, signal),
      // The rows of the page before stay while the next ones load
      placeholderData: keepPreviousData
    }),
  summary: () =>
    queryOptions({ queryKey: [...attendees, 'summary'], queryFn: ({ signal }) => getSummary(signal) }),
  one: (id: number) =>
    queryOptions({ queryKey: [...attendees, 'one', id], queryFn: ({ signal }) => getAttendee(id, signal) }),
  /** They do not change while the application is open. */
  countries: () =>
    queryOptions({ queryKey: ['countries'], queryFn: () => listCountries(), staleTime: Infinity })
};
