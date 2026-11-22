import { Route, Routes } from 'react-router';
import { Attendees } from './pages/Attendees';
import { Login } from './pages/Login';
import { NewAttendee } from './pages/NewAttendee';

export function App() {
  return (
    <main>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Attendees />} />
        <Route path="/attendees/new" element={<NewAttendee />} />
      </Routes>
    </main>
  );
}
