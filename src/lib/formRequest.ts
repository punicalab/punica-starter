// The bridge between a form and a request: what the server refuses is shown
// where the user can do something about it.
import type { FormController, FormItem } from '@punica/form';
import { SetErrors } from '@punica/form-service';
import { isHttpError, isRequestError } from '@punica/request';

/** The errors of a refused request, by field, as this API sends them. */
export type FieldErrors = Record<string, string[]>;

/** What the user is told above the form; the form shows its message. */
export class SubmitRejected extends Error {
  public override name = 'SubmitRejected';
}

const REASONS = {
  network: 'The server could not be reached. Check your connection and try again.',
  timeout: 'The server took too long to answer. Try again.',
  abort: 'The request was cancelled.',
  parse: 'The server sent an answer that could not be read.'
};

/**
 * Sends what a form was submitted with. A request the server refuses (400,
 * 422) puts its messages on the fields they are about and rejects with a
 * `SubmitRejected` that holds the rest; so does a request that brought no
 * response. Use it in the submit handler of a form: `@FormKit` lists the
 * `SetErrors` service it needs.
 */
export const submitTo = async <E extends object, F extends FormItem<E>, T>(
  controller: FormController<E, F>,
  send: () => Promise<T>
): Promise<T> => {
  try {
    return await send();
  } catch (error) {
    if (isHttpError<{ message?: string; errors?: FieldErrors }>(error)) {
      const { message, errors } = error.response.data ?? {};

      if ((error.status === 400 || error.status === 422) && errors) {
        // On the fields they name, rows of a list included; the rest is for the form
        const rest = await controller.getService(SetErrors).run(errors);

        throw new SubmitRejected(rest.length ? rest.join(' ') : 'Correct the marked fields and try again.');
      }

      throw new SubmitRejected(message ?? `The server answered with ${error.status}.`);
    }

    if (isRequestError(error)) throw new SubmitRejected(REASONS[error.reason]);

    throw error;
  }
};
