import { KitForm } from '@punica/form-kit/react';
import { useLocation, useNavigate } from 'react-router';
import { signIn } from '../api/auth';
import { LoginForm } from '../forms/login';
import { SubmitRejected } from '../lib/formRequest';
import { isHttpError } from '@punica/request';

export function Login() {
  const navigate = useNavigate();
  const expired = Boolean((useLocation().state as { expired?: boolean } | null)?.expired);

  return (
    <div className="narrow">
      <h1>Sign in</h1>
      {expired ? <punica-alert color="warning">Your session is over. Sign in again.</punica-alert> : null}
      <KitForm
        entity={() => new LoginForm()}
        submitLabel="Sign in"
        onSubmit={async ({ email, password }) => {
          try {
            await signIn(email, password);
          } catch (error) {
            // What is thrown here is shown above the fields
            throw new SubmitRejected(
              isHttpError<{ message: string }>(error) && error.status === 401
                ? error.response.data.message
                : 'Signing in did not work. Try again.'
            );
          }

          navigate('/', { replace: true });
        }}
        // The form shows the message; there is nothing else to do with it
        onError={() => undefined}
      />
      <p className="muted">admin@example.com / secret123</p>
    </div>
  );
}
