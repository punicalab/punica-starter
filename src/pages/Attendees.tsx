import { useState, type ReactNode } from 'react';
import { confirm } from '@punica/components';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { deleteAttendee, PAGE_SIZE } from '../api/attendees';
import type { Attendee } from '../api/attendees';
import { queries } from '../api/queries';
import { EditIcon, GlobeIcon, SeatIcon, StarIcon, TrashIcon, UsersIcon } from '../components/Icons';
import { notify } from '../lib/notify';

const seatsOf = (attendee: Attendee) => attendee.tickets.reduce((sum, ticket) => sum + ticket.quantity, 0);

function Stat({ icon, value, label }: { icon: ReactNode; value: number | undefined; label: string }) {
  return (
    <punica-card variant="outlined">
      <div className="stat">
        <span className="stat-icon">{icon}</span>
        <div>
          <div className="stat-value" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
            {value ?? '–'}
          </div>
          <div className="stat-label">{label}</div>
        </div>
      </div>
    </punica-card>
  );
}

export function Attendees() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const cache = useQueryClient();
  // Typing a new search gives the query another key: the one before is
  // cancelled, with its request
  const { data: result, isFetching: loading } = useQuery(queries.list(q, page));
  const { data: summary } = useQuery(queries.summary());
  const { data: countryList } = useQuery(queries.countries());
  const countries = Object.fromEntries((countryList ?? []).map(({ value, label }) => [value, label]));

  const removal = useMutation({
    mutationFn: (attendee: Attendee) => deleteAttendee(attendee.id),
    onSuccess: (_response, attendee) => {
      notify(`${attendee.name} was deleted`, 'success');
      // The last row of a page is gone: the page before it
      if (result?.items.length === 1 && page > 1) setPage(page - 1);

      // The list and the figures are asked for again
      return cache.invalidateQueries({ queryKey: queries.attendees });
    }
    // A failure was shown by the client already
  });

  const remove = async (attendee: Attendee) => {
    const sure = await confirm({
      heading: `Delete ${attendee.name}?`,
      message: 'Their tickets are released. This cannot be undone.',
      confirmLabel: 'Delete',
      color: 'error'
    });

    if (sure) removal.mutate(attendee);
  };

  const first = result && result.total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const last = result ? Math.min(page * PAGE_SIZE, result.total) : 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Attendees</h1>
          <p className="muted">Everyone who registered for the event, with their tickets.</p>
        </div>
        <punica-button onClick={() => navigate('/attendees/new')}>
          <punica-icon slot="start" name="plus" />
          New attendee
        </punica-button>
      </div>

      <div className="stats">
        <Stat icon={<UsersIcon />} value={summary?.total} label="Attendees" />
        <Stat icon={<StarIcon />} value={summary?.vip} label="VIP tickets" />
        <Stat icon={<SeatIcon />} value={summary?.seats} label="Seats booked" />
        <Stat icon={<GlobeIcon />} value={summary?.countries} label="Countries" />
      </div>

      <punica-card variant="outlined">
        <div className="toolbar">
          <punica-input
            type="search"
            label="Search attendees"
            placeholder="Search by name or email"
            clearable
            value={q}
            onpunica-input={(event: CustomEvent<{ value: string }>) => {
              setQ(event.detail.value);
              setPage(1);
            }}
          >
            <punica-icon slot="start" name="search" />
          </punica-input>
          {loading ? <punica-spinner label="Loading" size="small" /> : null}
          <span className="spacer" />
          <span className="muted small" data-testid="total">
            {result ? `${result.total} ${result.total === 1 ? 'attendee' : 'attendees'}` : ''}
          </span>
        </div>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Attendees, scrollable">
        <punica-table label="Attendees">
          <punica-table-header>
            <punica-table-row>
              <punica-table-header-cell>Attendee</punica-table-header-cell>
              <punica-table-header-cell>Country</punica-table-header-cell>
              <punica-table-header-cell>Ticket</punica-table-header-cell>
              <punica-table-header-cell align="end">Seats</punica-table-header-cell>
              <punica-table-header-cell align="end">Actions</punica-table-header-cell>
            </punica-table-row>
          </punica-table-header>
          <punica-table-body>
            {result?.items.map((attendee) => (
              <punica-table-row key={attendee.id}>
                <punica-table-cell>
                  <div className="person">
                    <punica-avatar name={attendee.name} size="small" color="primary" />
                    <div>
                      <Link className="person-name" to={`/attendees/${attendee.id}`}>
                        {attendee.name}
                      </Link>
                      <div className="person-email">{attendee.email}</div>
                    </div>
                  </div>
                </punica-table-cell>
                <punica-table-cell>{countries[attendee.country] ?? attendee.country}</punica-table-cell>
                <punica-table-cell>
                  {attendee.ticketType === 'vip' ? (
                    <punica-chip size="small" color="secondary">
                      VIP
                    </punica-chip>
                  ) : (
                    <punica-chip size="small" color="neutral" variant="outlined">
                      Standard
                    </punica-chip>
                  )}
                </punica-table-cell>
                <punica-table-cell align="end">
                  <span className="numeric">{seatsOf(attendee)}</span>
                </punica-table-cell>
                <punica-table-cell align="end">
                  <span className="row-actions">
                    <punica-icon-button
                      size="small"
                      label={`Edit ${attendee.name}`}
                      onClick={() => navigate(`/attendees/${attendee.id}`)}
                    >
                      <EditIcon />
                    </punica-icon-button>
                    <punica-icon-button
                      size="small"
                      color="error"
                      label={`Delete ${attendee.name}`}
                      onClick={() => remove(attendee)}
                    >
                      <TrashIcon />
                    </punica-icon-button>
                  </span>
                </punica-table-cell>
              </punica-table-row>
            ))}
          </punica-table-body>
          <punica-empty-state slot="empty" size="section" heading="No attendee matches">
            Try another search, or add an attendee.
          </punica-empty-state>
        </punica-table>
        </div>
        {result && result.total > 0 ? (
          <div className="table-footer">
            <span className="muted small" data-testid="range">
              Showing {first}–{last} of {result.total}
            </span>
            {result.total > PAGE_SIZE ? (
              <punica-pagination
                page={page}
                total-count={result.total}
                page-size={PAGE_SIZE}
                onpunica-change={(event: CustomEvent<{ page: number }>) => setPage(event.detail.page)}
              />
            ) : null}
          </div>
        ) : null}
      </punica-card>
    </>
  );
}
