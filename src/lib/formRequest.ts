// The bridge between a form and a request: what the server refuses is shown
// where the user can do something about it.
import type { CommandService, FormController, FormItem, IServiceInitialize } from '@punica/form';
import { isHttpError, isRequestError } from '@punica/request';

/** The errors of a refused request, by field, as this API sends them. */
export type FieldErrors = Record<string, string[]>;

/**
 * A service that writes messages of the server onto the items of a form.
 * List it in the services of the form: `@FormKit({ services: [ServerErrors] })`.
 */
export class ServerErrors<E, F extends FormItem<E> = FormItem<E>> implements IServiceInitialize<E, F> {
  #command!: CommandService<E, F>;

  public get name(): string {
    return 'serverErrors';
  }

  public initialize(command: CommandService<E, F>): void {
    this.#command = command;
  }

  /**
   * Shows the messages on the items they are about.
   * @returns The messages that are about no item of the form
   */
  public show(errors: FieldErrors): string[] {
    const items: F[] = [];
    const rest: string[] = [];

    for (const [property, messages] of Object.entries(errors)) {
      const item = this.#command.getItem(property as keyof E);

      if (item) items.push({ ...item, error: true, errorMessages: messages });
      else rest.push(...messages);
    }

    if (items.length) this.#command.setItems(items);

    return rest;
  }
}

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
 * response. Use it as the submit handler of a form whose services include
 * `ServerErrors`.
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
        const rest = controller.getService(ServerErrors<E, F>).show(errors);

        throw new SubmitRejected(rest.length ? rest.join(' ') : 'Correct the marked fields and try again.');
      }

      throw new SubmitRejected(message ?? `The server answered with ${error.status}.`);
    }

    if (isRequestError(error)) throw new SubmitRejected(REASONS[error.reason]);

    throw error;
  }
};
