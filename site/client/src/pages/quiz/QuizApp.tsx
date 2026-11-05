// `/quiz/*`: a lazy chunk. Players join with a PIN (no account needed); admins build and host.
//
// Each page is its own lazy chunk, so a player on a phone downloads the join and play screens
// only, not the studio, the editor, the presenter or the charts. Shared code (the quiz client,
// answer controls) lands in shared chunks that the pages reuse.
import '../../styles/quiz.css';
import { lazy, Suspense, type ComponentType } from 'react';
import { Route, Routes } from 'react-router';
import { BusyLine } from '../../components/forms';
import { NotFound } from '../NotFound';

const page = <T extends string>(load: () => Promise<Record<T, ComponentType>>, name: T) =>
  lazy(() => load().then((m) => ({ default: m[name] })));

const JoinPage = page(() => import('./JoinPage'), 'JoinPage');
const PlayRoom = page(() => import('./PlayRoom'), 'PlayRoom');
const ReviewPage = page(() => import('./ReviewPage'), 'ReviewPage');
const ProgressPage = page(() => import('./ProgressPage'), 'ProgressPage');
const OpenList = page(() => import('./OpenList'), 'OpenList');
const OpenPlay = page(() => import('./OpenPlay'), 'OpenPlay');
const Present = page(() => import('./Present'), 'Present');
const Board = page(() => import('./Board'), 'Board');
const Library = page(() => import('./Library'), 'Library');
const Editor = page(() => import('./Editor'), 'Editor');
const HostRoom = page(() => import('./HostRoom'), 'HostRoom');

export function QuizApp() {
  return (
    <Suspense fallback={<BusyLine>Loading…</BusyLine>}>
      <Routes>
        <Route index element={<JoinPage />} />
        <Route path="play/:pin" element={<PlayRoom />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="open" element={<OpenList />} />
        <Route path="open/:id" element={<OpenPlay />} />
        <Route path="present/:pin" element={<Present />} />
        <Route path="board/:pin" element={<Board />} />
        <Route path="host" element={<Library />} />
        <Route path="host/edit/:id" element={<Editor />} />
        <Route path="host/:pin" element={<HostRoom />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
