import { useEffect } from 'react';
import type {} from '@punica/components/react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { signOut } from './api/auth';
import { session, whenSessionIsOver } from './api/client';
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
    whenSessionIsOver(() => navigate('/login', { replace: true, state: { expired: true } }));
  }, [navigate]);

  return (
    <>
      <punica-app-bar color="neutral" position="sticky">
        <Link className="brand" to="/">
          Punica Starter
        </Link>
        {signedIn ? (
          <punica-button
            slot="end"
            variant="text"
            onClick={() => {
              signOut();
              navigate('/login');
            }}
          >
            Sign out
          </punica-button>
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
