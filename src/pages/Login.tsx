import { KitForm } from '@punica/form-kit/react';
import { isHttpError } from '@punica/request';
import { useLocation, useNavigate } from 'react-router';
import { signIn } from '../api/auth';
import { Logo } from '../components/Icons';
import { LoginForm } from '../forms/login';
import { SubmitRejected } from '../lib/formRequest';

export function Login() {
  const navigate = useNavigate();
  const expired = Boolean((useLocation().state as { expired?: boolean } | null)?.expired);

  return (
    <div className="auth">
      <punica-card variant="outlined">
        <div className="auth-card">
          <Logo />
          <h1>Sign in</h1>
          <p className="muted lead">Manage the attendees of your event.</p>
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
          <p className="muted small auth-hint">
            Demo account: <code>admin@example.com</code> / <code>secret123</code>
          </p>
        </div>
      </punica-card>
    </div>
  );
}
