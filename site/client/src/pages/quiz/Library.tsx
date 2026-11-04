import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { FormMessage } from '../../components/forms';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { apiResponse } from '../../lib/api';
import { apiMessage, createRoom, listRooms, parseQuiz, setHostSecret, type Mode, type OpenRoom } from '../../lib/quiz';
import {
  blankDoc,
  deleteDoc,
  download,
  fromServer,
  loadLibrary,
  saveDoc,
  slugify,
  toServer,
  toText,
  type QuizDoc,
} from '../../lib/quiz-doc';
import { AdminGate } from './AdminGate';

/** `/quiz/host`: the admin's quiz library, open rooms, import and "start a room". */
export function Library() {
  return (
    <AdminGate>
      <LibraryPage />
    </AdminGate>
  );
}

function LibraryPage() {
  useDocumentTitle('Quiz studio');
  const navigate = useNavigate();
  const [docs, setDocs] = useState<QuizDoc[]>(() => loadLibrary());
  const [rooms, setRooms] = useState<OpenRoom[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [study, setStudy] = useState<Record<string, boolean>>({});
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRooms()
      .then((r) => setRooms(r.rooms))
      .catch(() => setRooms([]));
  }, []);

  const importText = async (text: string, name: string) => {
    setBusy(true);
    setMessage(null);
    try {
      let input: { source: string } | { quiz: unknown } = { source: text };
      if (name.endsWith('.json') || text.trimStart().startsWith('{')) input = { quiz: JSON.parse(text) as unknown };
      const result = await parseQuiz(input);
      if (!result.ok) {
        setMessage({ tone: 'error', text: `Could not import ${name}: ${result.errors.slice(0, 3).join('; ')}` });
        return;
      }
      const doc = fromServer(result.quiz);
      setDocs(saveDoc(doc));
      navigate(`/quiz/host/edit/${doc.id}`);
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof SyntaxError ? `${name} is not valid JSON` : apiMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const fromExample = async () => {
    try {
      const response = await apiResponse('/api/quiz/template', { headers: { Accept: 'text/plain' } });
      await importText(await response.text(), 'the example');
    } catch (e) {
      setMessage({ tone: 'error', text: apiMessage(e) });
    }
  };

  const host = async (doc: QuizDoc, mode: Mode) => {
    setBusy(true);
    setMessage(null);
    try {
      const room = await createRoom(toServer(doc), mode, !!study[doc.id]);
      setHostSecret(room.pin, room.hostKey);
      navigate(`/quiz/host/${room.pin}`);
    } catch (e) {
      setMessage({ tone: 'error', text: `“${doc.title}” can’t start yet: ${apiMessage(e)}` });
      setBusy(false);
    }
  };

  const create = () => {
    const doc = blankDoc();
    setDocs(saveDoc(doc));
    navigate(`/quiz/host/edit/${doc.id}`);
  };

  return (
    <section className="page page--wide studio" aria-labelledby="page-title">
      <p className="eyebrow">Admin · Quiz studio</p>
      <h1 id="page-title">Quiz studio</h1>
      <p className="lede">
        Build quizzes and lessons, then run them live (you control the pace) or as a self-paced challenge with
        flashcards. Players join at <strong>{window.location.host}/quiz</strong> with the room PIN (up to 250 per room).
      </p>

      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}

      {rooms.length > 0 && (
        <section className="studio__rooms" aria-labelledby="rooms-title">
          <h2 id="rooms-title">Open rooms</h2>
          <ul className="studio__room-list">
            {rooms.map((r) => (
              <li key={r.pin}>
                <Link to={`/quiz/host/${r.pin}`} onClick={() => setHostSecret(r.pin, r.hostKey)}>
                  <strong className="mono">{r.pin}</strong> · {r.title}
                </Link>
                <span className="muted small">
                  {r.mode === 'self' ? 'self-paced' : 'live'} · {r.phase} · {r.players} players
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="studio__toolbar">
        <button type="button" className="btn btn--primary" onClick={create}>
          + New quiz
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => file.current?.click()}>
          Import .txt / .json
        </button>
        <input
          ref={file}
          type="file"
          accept=".txt,.json,text/plain,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (f.size > 200_000) return setMessage({ tone: 'error', text: 'That file is larger than 200 KB.' });
            await importText(await f.text(), f.name);
          }}
        />
        <button type="button" className="btn btn--quiet" disabled={busy} onClick={fromExample}>
          Start from the example
        </button>
      </div>

      {docs.length === 0 ? (
        <div className="notice">
          <h2>No quizzes yet</h2>
          <p>Create one, import a file, or start from the example (it has one of every item type).</p>
        </div>
      ) : (
        <ul className="studio__grid">
          {docs.map((doc) => {
            const questions = doc.items.filter((i) => i.type !== 'slide').length;
            const slides = doc.items.length - questions;
            return (
              <li key={doc.id} className="studio__card">
                <h3 className="studio__card-title">
                  <Link to={`/quiz/host/edit/${doc.id}`}>{doc.title || 'Untitled quiz'}</Link>
                </h3>
                <p className="muted small">
                  {questions} question{questions === 1 ? '' : 's'}
                  {slides ? ` · ${slides} slide${slides === 1 ? '' : 's'}` : ''} · edited{' '}
                  {new Date(doc.updated).toLocaleDateString()}
                </p>
                <div className="studio__card-actions">
                  <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={() => host(doc, 'live')}>
                    Host live
                  </button>
                  <button type="button" className="btn btn--small" disabled={busy} onClick={() => host(doc, 'self')}>
                    Self-paced
                  </button>
                  <label className="studio__check small">
                    <input
                      type="checkbox"
                      checked={!!study[doc.id]}
                      onChange={(e) => setStudy((s) => ({ ...s, [doc.id]: e.target.checked }))}
                    />{' '}
                    flashcards first
                  </label>
                </div>
                <div className="studio__card-more">
                  <Link to={`/quiz/host/edit/${doc.id}`}>Edit</Link>
                  <button type="button" className="link-button" onClick={() => setDocs(saveDoc({ ...doc, id: blankDoc().id, title: `${doc.title} (copy)` }))}>
                    Duplicate
                  </button>
                  <button type="button" className="link-button" onClick={() => download(`${slugify(doc.title)}.json`, JSON.stringify(toServer(doc), null, 2), 'application/json')}>
                    .json
                  </button>
                  <button type="button" className="link-button" onClick={() => download(`${slugify(doc.title)}.txt`, toText(doc), 'text/plain')}>
                    .txt
                  </button>
                  <button
                    type="button"
                    className="link-button link-button--danger"
                    onClick={() => {
                      if (window.confirm(`Delete “${doc.title}” from this browser?`)) setDocs(deleteDoc(doc.id));
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted small">
        Quizzes are saved in this browser. Export them (.json or .txt) to keep a copy or move them to another device.
      </p>
    </section>
  );
}
