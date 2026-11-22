import { useEffect, useMemo, useState } from 'react';
import { confirm } from '@punica/components';
import { useFormController, useFormState } from '@punica/form-react';
import { FormView } from '@punica/form-kit/react';
import type { KitItem } from '@punica/form-kit';
import { useNavigate, useParams } from 'react-router';
import { getAttendee, saveAttendee, uploadBadge } from '../api/attendees';
import type { Attendee } from '../api/attendees';
import { attendeeForm } from '../forms/attendee';
import type { AttendeeValues } from '../forms/attendee';
import { submitTo } from '../lib/formRequest';
import { notify } from '../lib/notify';

/** The page of a new attendee (`/attendees/new`) and of an existing one (`/attendees/7`). */
export function AttendeeFormPage() {
  const params = useParams();
  const id = params.id === undefined ? undefined : Number(params.id);
  const [attendee, setAttendee] = useState<Attendee>();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (id === undefined) return;

    const leaving = new AbortController();

    getAttendee(id, leaving.signal)
      .then(setAttendee)
      .catch(() => setMissing(!leaving.signal.aborted));

    return () => leaving.abort();
  }, [id]);

  if (missing) {
    return (
      <punica-empty-state heading="This attendee is not here">It may have been deleted.</punica-empty-state>
    );
  }

  if (id !== undefined && !attendee) return <punica-spinner label="Loading the attendee" />;

  // A new form for another attendee
  return <Editor key={id ?? 'new'} attendee={attendee} />;
}

function Editor({ attendee }: { attendee?: Attendee }) {
  const navigate = useNavigate();
  const Form = useMemo(() => attendeeForm(attendee), [attendee]);
  const { controller, error } = useFormController<AttendeeValues, KitItem<AttendeeValues>>(() => new Form());

  if (error) return <punica-alert color="error">The form could not be started.</punica-alert>;
  if (!controller) return <punica-spinner label="Preparing the form" />;

  return (
    <>
      <div className="row between">
        <h1>{attendee ? attendee.name : 'New attendee'}</h1>
        <Leave controller={controller} onLeave={() => navigate('/')} />
      </div>
      <FormView
        controller={controller}
        submitLabel={attendee ? 'Save changes' : 'Create attendee'}
        resetLabel="Reset"
        // What the server refuses is shown by the form
        onError={() => undefined}
        onSubmit={async ({ badge, ...values }) => {
          const saved = await submitTo(controller, () =>
            saveAttendee(
              {
                ...values,
                birthDate: values.birthDate ?? '',
                tickets: values.tickets.map(({ session, quantity }) => ({ session, quantity: quantity ?? 0 }))
              },
              attendee?.id
            )
          );

          if (badge) await submitTo(controller, () => uploadBadge(saved.id, badge));

          notify(`${saved.name} was saved`, 'success');
          navigate('/');
        }}
      />
    </>
  );
}

/** Leaves the form; asks first when there is something to lose. */
function Leave({
  controller,
  onLeave
}: {
  controller: NonNullable<ReturnType<typeof useFormController<AttendeeValues, KitItem<AttendeeValues>>>['controller']>;
  onLeave: () => void;
}) {
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
