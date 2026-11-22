import { useEffect, useState } from 'react';
import { confirm } from '@punica/components';
import { isRequestError } from '@punica/request';
import { Link, useNavigate } from 'react-router';
import { deleteAttendee, listAttendees, PAGE_SIZE } from '../api/attendees';
import type { Attendee, Page } from '../api/attendees';
import { notify } from '../lib/notify';

export function Attendees() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<Attendee>>();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const leaving = new AbortController();

    setLoading(true);
    listAttendees(q, page, leaving.signal)
      .then((found) => {
        setResult(found);
        setLoading(false);
      })
      .catch((error) => {
        // Replaced by a newer search, or the page was left: nothing to show.
        // Other failures were shown by the client already
        if (!(isRequestError(error) && error.reason === 'abort')) setLoading(false);
      });

    return () => leaving.abort();
  }, [q, page, version]);

  const remove = async (attendee: Attendee) => {
    const sure = await confirm({
      heading: `Delete ${attendee.name}?`,
      message: 'Their tickets are released.',
      confirmLabel: 'Delete',
      color: 'error'
    });

    if (!sure) return;

    try {
      await deleteAttendee(attendee.id);
      notify(`${attendee.name} was deleted`, 'success');
      setVersion((count) => count + 1);
    } catch {
      // The client showed the message
    }
  };

  return (
    <>
      <div className="row between">
        <h1>Attendees</h1>
        <punica-button onClick={() => navigate('/attendees/new')}>New attendee</punica-button>
      </div>
      <div className="row">
        <punica-input
          class="grow"
          type="search"
          label="Search attendees"
          placeholder="Search by name or email"
          clearable
          value={q}
          onpunica-input={(event: CustomEvent<{ value: string }>) => {
            setQ(event.detail.value);
            setPage(1);
          }}
        />
        {loading ? <punica-spinner label="Loading" size="small" /> : null}
        <span className="muted" data-testid="total">
          {result ? `${result.total} attendees` : ''}
        </span>
      </div>
      <punica-table label="Attendees" striped>
        <punica-table-header>
          <punica-table-row>
            <punica-table-header-cell>Name</punica-table-header-cell>
            <punica-table-header-cell>Email</punica-table-header-cell>
            <punica-table-header-cell>Ticket</punica-table-header-cell>
            <punica-table-header-cell align="end">Actions</punica-table-header-cell>
          </punica-table-row>
        </punica-table-header>
        <punica-table-body>
          {result?.items.map((attendee) => (
            <punica-table-row key={attendee.id}>
              <punica-table-cell>
                <Link to={`/attendees/${attendee.id}`}>{attendee.name}</Link>
              </punica-table-cell>
              <punica-table-cell>{attendee.email}</punica-table-cell>
              <punica-table-cell>{attendee.ticketType === 'vip' ? 'VIP' : 'Standard'}</punica-table-cell>
              <punica-table-cell align="end">
                <punica-button
                  variant="text"
                  color="error"
                  size="small"
                  label={`Delete ${attendee.name}`}
                  onClick={() => remove(attendee)}
                >
                  Delete
                </punica-button>
              </punica-table-cell>
            </punica-table-row>
          ))}
        </punica-table-body>
        <punica-empty-state slot="empty" size="section" heading="No attendee matches">
          Try another search, or add an attendee.
        </punica-empty-state>
      </punica-table>
      {result && result.total > PAGE_SIZE ? (
        <punica-pagination
          page={page}
          total-count={result.total}
          page-size={PAGE_SIZE}
          onpunica-change={(event: CustomEvent<{ page: number }>) => setPage(event.detail.page)}
        />
      ) : null}
    </>
  );
}
