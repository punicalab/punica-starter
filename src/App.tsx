import { useEffect } from 'react';
import type {} from '@punica/components/react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { signOut } from './api/auth';
import { session, whenSessionIsOver } from './api/client';
import { queryClient } from './api/queries';
import { Logo, SignOutIcon } from './components/Icons';
import { AttendeeFormPage } from './pages/AttendeeForm';
import { Attendees } from './pages/Attendees';
import { Login } from './pages/Login';

export function App() {
  const navigate = useNavigate();

  // A navigation renders this again: signing in and out are navigations
  useLocation();

  const signedIn = Boolean(session.token);

  // The client says when a session cannot be continued
  useEffect(() => {
    whenSessionIsOver(() => {
      queryClient.clear();
      navigate('/login', { replace: true, state: { expired: true } });
    });
  }, [navigate]);

  return (
    <>
      <punica-app-bar color="neutral" position="sticky">
        <Link className="brand" to="/" slot="start">
          <Logo />
          Punica Starter
        </Link>
        {signedIn ? (
          <div className="account" slot="end">
            <punica-avatar name="Admin" size="small" color="primary" />
            <span className="account-name">Admin</span>
            <punica-icon-button
              label="Sign out"
              onClick={() => {
                signOut();
                navigate('/login');
              }}
            >
              <SignOutIcon />
            </punica-icon-button>
          </div>
        ) : null}
      </punica-app-bar>
      <main>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={signedIn ? <Attendees /> : <Navigate to="/login" replace />} />
          <Route
            path="/attendees/new"
            element={signedIn ? <AttendeeFormPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/attendees/:id"
            element={signedIn ? <AttendeeFormPage /> : <Navigate to="/login" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
