import { api } from './client';

export interface Ticket {
  session: string;
  quantity: number;
}

export interface Attendee {
  id: number;
  name: string;
  email: string;
  country: string;
  birthDate: string;
  ticketType: string;
  interests: string[];
  tickets: Ticket[];
}

export type AttendeeInput = Omit<Attendee, 'id'>;

export interface Page<T> {
  items: T[];
  total: number;
}

export interface Country {
  value: string;
  label: string;
}

export const PAGE_SIZE = 10;

export const listAttendees = async (q: string, page: number, signal?: AbortSignal) =>
  (await api.get<Page<Attendee>>('attendees', { query: { q: q || undefined, page, pageSize: PAGE_SIZE }, signal })).data;

export const getAttendee = async (id: number, signal?: AbortSignal) =>
  (await api.get<Attendee>(`attendees/${id}`, { signal })).data;

/** Creates an attendee, or changes the one with `id`. The caller shows what the server refuses. */
export const saveAttendee = async (input: AttendeeInput, id?: number) =>
  (id === undefined
    ? await api.post<Attendee>('attendees', { json: input, silent: true })
    : await api.put<Attendee>(`attendees/${id}`, { json: input, silent: true })
  ).data;

export const deleteAttendee = (id: number) => api.delete(`attendees/${id}`);

export const uploadBadge = (id: number, file: File) => {
  const body = new FormData();

  body.append('badge', file, file.name);

  return api.post<{ name: string }>(`attendees/${id}/badge`, { body });
};

/** The countries, asked for once an hour however many forms show them. */
export const listCountries = async () =>
  (await api.get<Country[]>('countries', { cache: { ttl: 60 * 60 * 1000 } })).data;

export const isEmailAvailable = async (email: string, except: number | undefined, signal?: AbortSignal) =>
  (
    await api.get<{ available: boolean }>('attendees/email-available', {
      query: { email, except },
      signal,
      silent: true
    })
  ).data.available;
