// `/quiz/*`: a lazy chunk. Players join with a PIN (no account needed); admins host.
import '../../styles/quiz.css';
import { Route, Routes } from 'react-router';
import { NotFound } from '../NotFound';
import { HostRoom } from './HostRoom';
import { HostSetup } from './HostSetup';
import { JoinPage } from './JoinPage';
import { PlayRoom } from './PlayRoom';

export function QuizApp() {
  return (
    <Routes>
      <Route index element={<JoinPage />} />
      <Route path="play/:pin" element={<PlayRoom />} />
      <Route path="host" element={<HostSetup />} />
      <Route path="host/:pin" element={<HostRoom />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
