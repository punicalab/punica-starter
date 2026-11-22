import { FormController } from '@punica/form';
import { FormKit, TextField } from '@punica/form-kit';
import { Submit } from '@punica/form-service';
import { createClient } from '@punica/request';
import type { Adapter } from '@punica/request';
import { describe, expect, it } from 'vitest';
import { submitTo, SubmitRejected } from './formRequest';

@FormKit()
class PersonForm {
  @TextField({ label: 'Name' })
  name = 'Ada';

  @TextField({ label: 'Email' })
  email = 'ada@example.com';
}

const start = async () => {
  const controller = await FormController.fromEntity(new PersonForm());

  await controller.start();

  return controller;
};

/** A client whose server answers every request the same way. */
const clientThat = (answer: Adapter) => createClient({ baseURL: 'https://api.test', adapter: answer });
const refuses = (status: number, body: unknown) =>
  clientThat(async () => Response.json(body, { status }));
const item = (controller: Awaited<ReturnType<typeof start>>, property: string) =>
  controller.getForm().items.find((one) => one.property === property);

describe('submitTo', () => {
  it('gives back what the request brought', async () => {
    const controller = await start();
    const api = clientThat(async () => Response.json({ id: 7 }));

    await expect(submitTo(controller, async () => (await api.post<{ id: number }>('people')).data)).resolves.toEqual({
      id: 7
    });
  });

  it.each([400, 422])('shows the messages of a %i on the fields they are about', async (status) => {
    const controller = await start();
    const api = refuses(status, { errors: { email: ['Taken', 'And too long'] } });
    const error = await submitTo(controller, () => api.post('people')).catch((e) => e);

    expect(error).toBeInstanceOf(SubmitRejected);
    expect(error.message).toBe('Correct the marked fields and try again.');
    expect(item(controller, 'email')).toMatchObject({ error: true, errorMessages: ['Taken', 'And too long'] });
    expect(item(controller, 'name')?.error).toBeFalsy();
  });

  it('gives the messages that are about no field to the form', async () => {
    const controller = await start();
    const api = refuses(422, { errors: { email: ['Taken'], capacity: ['Full'], other: ['Closed'] } });
    const error = await submitTo(controller, () => api.post('people')).catch((e) => e);

    expect(error.message).toBe('Full Closed');
    expect(item(controller, 'email')?.errorMessages).toEqual(['Taken']);
  });

  it('is what the Submit service shows above the fields, without rejecting', async () => {
    const controller = await start();
    const api = refuses(422, { errors: { capacity: ['Full'] } });
    const done = await controller.getService(Submit).run(() => submitTo(controller, () => api.post('people')).then(() => undefined));

    expect(done).toBe(false);
    expect(controller.getForm().state?.errors).toEqual(['Full']);
    expect(controller.getForm().state?.submitting).toBe(false);
  });

  it('tells another failed response by the message of the server, or its status', async () => {
    const controller = await start();

    await expect(submitTo(controller, () => refuses(409, { message: 'Changed by someone else' }).post('x'))).rejects.toThrow(
      'Changed by someone else'
    );
    await expect(submitTo(controller, () => refuses(500, {}).post('x'))).rejects.toThrow('The server answered with 500.');
    // A 422 without errors by field is such a response too
    await expect(submitTo(controller, () => refuses(422, { message: 'No' }).post('x'))).rejects.toThrow('No');
  });

  it('tells a request that brought no response in words', async () => {
    const controller = await start();
    const offline = clientThat(async () => {
      throw new TypeError('Failed to fetch');
    });
    const slow = createClient({
      baseURL: 'https://api.test',
      timeout: 5,
      adapter: (context) =>
        new Promise((_, reject) => context.signal.addEventListener('abort', () => reject(new Error('aborted'))))
    });

    await expect(submitTo(controller, () => offline.post('x'))).rejects.toThrow(/could not be reached/);
    await expect(submitTo(controller, () => slow.post('x'))).rejects.toThrow(/took too long/);
  });

  it('lets a mistake of the code through as it is', async () => {
    const controller = await start();
    const mistake = new RangeError('a bug');

    await expect(
      submitTo(controller, async () => {
        throw mistake;
      })
    ).rejects.toBe(mistake);
  });
});
