import {
  ArrayField,
  DateField,
  FileField,
  FormKit,
  MultiSelectField,
  NumberField,
  RadioGroupField,
  SelectField,
  TextField
} from '@punica/form-kit';
import { Schema, SchemaValidation } from '@punica/form-schema';
import { z } from 'zod';
import { isEmailAvailable, listCountries } from '../api/attendees';
import type { Attendee } from '../api/attendees';
import { ServerErrors } from '../lib/formRequest';

/** A row of the tickets. */
export class TicketForm {
  @SelectField({
    label: 'Session',
    options: ['Opening', 'Compilers', 'Workshop', 'Closing'],
    required: true
  })
  session = '';

  @NumberField({ label: 'Quantity', min: 1, max: 10, required: true })
  quantity?: number = 1;
}

const today = () => new Date().toISOString().slice(0, 10);

/** A rule about two fields at once, where a schema is at home. */
const Rules = z
  .object({ ticketType: z.string(), birthDate: z.string().optional() })
  .refine((attendee) => attendee.ticketType !== 'vip' || Boolean(attendee.birthDate), {
    path: ['birthDate'],
    message: 'A VIP ticket needs a date of birth'
  });

/**
 * The form of an attendee. A function, because the email check has to know
 * which attendee is being edited: their own email is not taken.
 */
export const attendeeForm = (attendee?: Attendee) => {
  @Schema(Rules)
  @FormKit({ columns: 2, services: [SchemaValidation, ServerErrors] })
  class AttendeeForm {
    @TextField({ label: 'Name', required: true, minLength: 2 })
    name = attendee?.name ?? '';

    @TextField({
      label: 'Email',
      inputType: 'email',
      required: true,
      pattern: /^\S+@\S+\.\S+$/,
      messages: { pattern: () => 'Enter a valid email address' },
      // Asks the server while the user types: once, after they stop, and an
      // answer that comes too late is dropped
      validateDebounce: 300,
      validation: async ({ formItem }, context) => {
        const email = String(formItem.value ?? '');

        if (!email || email === attendee?.email) return { error: false };

        const available = await isEmailAvailable(email, attendee?.id, context?.signal);

        return available ? { error: false } : { error: true, errorMessages: ['This email is already registered'] };
      }
    })
    email = attendee?.email ?? '';

    @SelectField({
      label: 'Country',
      options: async () => listCountries(),
      required: true
    })
    country = attendee?.country ?? '';

    @DateField({ label: 'Date of birth', maxDate: today() })
    birthDate?: string = attendee?.birthDate || undefined;

    @RadioGroupField({
      label: 'Ticket',
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'vip', label: 'VIP' }
      ],
      orientation: 'horizontal',
      required: true
    })
    ticketType = attendee?.ticketType ?? 'standard';

    @MultiSelectField({
      label: 'Interests',
      options: [
        { value: 'talks', label: 'Talks' },
        { value: 'workshops', label: 'Workshops' },
        { value: 'networking', label: 'Networking' },
        { value: 'expo', label: 'Expo' }
      ],
      maxItems: 3
    })
    interests: string[] = attendee?.interests ?? [];

    @FileField({ label: 'Badge photo', accept: 'image/*', maxFileSize: 200 * 1024, span: 'full' })
    badge?: File;

    @ArrayField({
      label: 'Tickets',
      row: () => new TicketForm(),
      minItems: 1,
      addLabel: 'Add ticket',
      span: 'full'
    })
    tickets: TicketForm[] = (attendee?.tickets ?? [{ session: 'Opening', quantity: 1 }]).map((ticket) =>
      Object.assign(new TicketForm(), ticket)
    );
  }

  return AttendeeForm;
};

export type AttendeeValues = InstanceType<ReturnType<typeof attendeeForm>>;
