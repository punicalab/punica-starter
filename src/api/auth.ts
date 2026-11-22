import { api, session } from './client';

export const signIn = async (email: string, password: string) => {
  // The form shows what is wrong: no message from the client
  const { data } = await api.post<{ token: string; name: string }>('auth/login', {
    json: { email, password },
    silent: true
  });

  session.start(data.token);

  return data;
};

export const signOut = () => session.end();
