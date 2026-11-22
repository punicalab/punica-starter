import { useMemo } from 'react';
import { confirm } from '@punica/components';
import type { FormController } from '@punica/form';
import type { KitItem } from '@punica/form-kit';
import { FormView } from '@punica/form-kit/react';
import { useForm, useFormController, useFormState } from '@punica/form-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { saveAttendee, uploadBadge } from '../api/attendees';
import type { Attendee, AttendeeInput } from '../api/attendees';
import { queries } from '../api/queries';
import { attendeeForm } from '../forms/attendee';
import type { AttendeeValues } from '../forms/attendee';
import { submitTo } from '../lib/formRequest';
import { notify } from '../lib/notify';

type Controller = FormController<AttendeeValues, KitItem<AttendeeValues>>;

/** The page of a new attendee (`/attendees/new`) and of an existing one (`/attendees/7`). */
export function AttendeeFormPage() {
  const params = useParams();
  const id = params.id === undefined ? undefined : Number(params.id);
  // A form starts from what the server holds now, not from what a list showed a while ago
  const { data: attendee, isError: missing } = useQuery({
    ...queries.one(id ?? 0),
    enabled: id !== undefined,
    staleTime: 0,
    gcTime: 0
  });

  if (missing) {
    return (
      <punica-empty-state heading="This attendee is not here">
        It may have been deleted.
        <span slot="actions">
          <Link to="/">Back to the list</Link>
        </span>
      </punica-empty-state>
    );
  }

  if (id !== undefined && !attendee) return <punica-spinner label="Loading the attendee" />;

  // A new form for another attendee
  return <Editor key={id ?? 'new'} attendee={attendee} />;
}

function Editor({ attendee }: { attendee?: Attendee }) {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const saving = useMutation({
    mutationFn: async ({ input, badge }: { input: AttendeeInput; badge?: File }) => {
      const saved = await saveAttendee(input, attendee?.id);

      if (badge) await uploadBadge(saved.id, badge);

      return saved;
    },
    // The list, the figures and this attendee are asked for again
    onSuccess: () => cache.invalidateQueries({ queryKey: queries.attendees })
  });
  const Form = useMemo(() => attendeeForm(attendee), [attendee]);
  const { controller, error } = useFormController<AttendeeValues, KitItem<AttendeeValues>>(() => new Form());
  const title = attendee ? attendee.name : 'New attendee';

  if (error) return <punica-alert color="error">The form could not be started.</punica-alert>;
  if (!controller) return <punica-spinner label="Preparing the form" />;

  return (
    <>
      <punica-breadcrumbs>
        <punica-breadcrumb-item>
          <Link to="/">Attendees</Link>
        </punica-breadcrumb-item>
        <punica-breadcrumb-item>{title}</punica-breadcrumb-item>
      </punica-breadcrumbs>
      <div className="page-header">
        <div>
          <h1>{title}</h1>
          <p className="muted">
            {attendee ? 'Change the details and the tickets of this attendee.' : 'Register someone for the event.'}
          </p>
        </div>
        <Leave controller={controller} onLeave={() => navigate('/')} />
      </div>
      <div className="editor">
        <punica-card variant="outlined">
          <div className="panel">
            <h2>Details and tickets</h2>
            <p className="muted small panel-lead">Fields with a star are required.</p>
            <FormView
              controller={controller}
              submitLabel={attendee ? 'Save changes' : 'Create attendee'}
              resetLabel="Reset"
              // What the server refuses is shown by the form
              onError={() => undefined}
              onSubmit={async ({ badge, ...values }) => {
                // What the server refuses goes onto the fields; the mutation keeps the caches right
                const saved = await submitTo(controller, () =>
                  saving.mutateAsync({
                    badge,
                    input: {
                      ...values,
                      birthDate: values.birthDate ?? '',
                      tickets: values.tickets.map(({ session, quantity }) => ({ session, quantity: quantity ?? 0 }))
                    }
                  })
                );

                notify(`${saved.name} was saved`, 'success');
                navigate('/');
              }}
            />
          </div>
        </punica-card>
        <aside className="summary">
          <Summary controller={controller} />
          <punica-card variant="outlined">
            <div className="panel">
              <h2>How this form works</h2>
              <ul className="muted small tips">
                <li>The email is checked with the server while you type.</li>
                <li>A VIP ticket needs a date of birth.</li>
                <li>One attendee can hold at most 10 seats.</li>
              </ul>
            </div>
          </punica-card>
        </aside>
      </div>
    </>
  );
}

/** What the form holds so far, following every change. */
function Summary({ controller }: { controller: Controller }) {
  const form = useForm(controller);
  const state = useFormState(controller);
  const value = <K extends keyof AttendeeValues>(property: K) =>
    form.items.find((item) => item.property === property)?.value as AttendeeValues[K] | undefined;
  const name = value('name') || 'No name yet';
  const tickets = value('tickets') ?? [];
  const seats = tickets.reduce((sum, ticket) => sum + Number(ticket.quantity ?? 0), 0);

  return (
    <punica-card variant="outlined">
      <div className="panel">
        <h2>Summary</h2>
        <div className="summary-person">
          <punica-avatar name={value('name') || undefined} color="primary" />
          <div>
            <div className="person-name truncate" data-testid="summary-name">
              {name}
            </div>
            <div className="person-email truncate">{value('email') || 'No email yet'}</div>
          </div>
        </div>
        <punica-metadata-list label="Summary" dense>
          <punica-metadata-list-item label="Ticket">
            {value('ticketType') === 'vip' ? 'VIP' : 'Standard'}
          </punica-metadata-list-item>
          <punica-metadata-list-item label="Sessions">{tickets.length}</punica-metadata-list-item>
          <punica-metadata-list-item label="Seats">
            <span data-testid="summary-seats">{seats}</span>
          </punica-metadata-list-item>
          <punica-metadata-list-item label="Status">
            {state?.dirty ? 'Unsaved changes' : 'No changes'}
          </punica-metadata-list-item>
        </punica-metadata-list>
      </div>
    </punica-card>
  );
}

/** Leaves the form; asks first when there is something to lose. */
function Leave({ controller, onLeave }: { controller: Controller; onLeave: () => void }) {
  const state = useFormState(controller);

  return (
    <punica-button
      variant="outlined"
      onClick={async () => {
        if (
          !state?.dirty ||
          (await confirm({
            heading: 'Leave without saving?',
            message: 'What you changed is lost.',
            confirmLabel: 'Leave',
            color: 'error'
          }))
        ) {
          onLeave();
        }
      }}
    >
      Back to the list
    </punica-button>
  );
}
