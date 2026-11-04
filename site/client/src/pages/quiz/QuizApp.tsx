// `/quiz/*`: a lazy chunk. Players join with a PIN (no account needed); admins build and host.
import '../../styles/quiz.css';
import { Route, Routes } from 'react-router';
import { NotFound } from '../NotFound';
import { Editor } from './Editor';
import { HostRoom } from './HostRoom';
import { JoinPage } from './JoinPage';
import { Library } from './Library';
import { PlayRoom } from './PlayRoom';
import { ReviewPage } from './ReviewPage';

export function QuizApp() {
  return (
    <Routes>
      <Route index element={<JoinPage />} />
      <Route path="play/:pin" element={<PlayRoom />} />
      <Route path="review" element={<ReviewPage />} />
      <Route path="host" element={<Library />} />
      <Route path="host/edit/:id" element={<Editor />} />
      <Route path="host/:pin" element={<HostRoom />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
