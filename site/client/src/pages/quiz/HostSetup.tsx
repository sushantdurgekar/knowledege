import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BusyLine, FormMessage } from '../../components/forms';
import { useMe } from '../../context/me';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { apiResponse } from '../../lib/api';
import {
  apiMessage,
  createRoom,
  listRooms,
  parseQuiz,
  setHostSecret,
  TYPE_LABELS,
  type QuizSummary,
} from '../../lib/quiz';
import { NotFound } from '../NotFound';

/** `/quiz/host`: admins import questions (paste or .txt upload), check them and open a room. */
export function HostSetup() {
  const { me } = useMe();
  if (me.status === 'loading') return <BusyLine>Loading…</BusyLine>;
  if (me.status !== 'signed-in' || !me.user.admin) return <NotFound />;
  return <Setup />;
}

type Rooms = Awaited<ReturnType<typeof listRooms>>['rooms'];

function Setup() {
  useDocumentTitle('Host a live quiz');
  const navigate = useNavigate();
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<QuizSummary | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Rooms>([]);

  useEffect(() => {
    listRooms()
      .then((r) => setRooms(r.rooms))
      .catch(() => setRooms([]));
  }, []);

  const loadTemplate = async () => {
    try {
      const response = await apiResponse('/api/quiz/template', { headers: { Accept: 'text/plain' } });
      setSource(await response.text());
      setPreview(null);
      setErrors([]);
    } catch (e) {
      setMessage(apiMessage(e));
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 200_000) return setMessage('That file is larger than 200 KB.');
    setSource(await file.text());
    setPreview(null);
    setErrors([]);
  };

  const check = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await parseQuiz(source);
      if (result.ok) {
        setPreview(result);
        setErrors([]);
      } else {
        setPreview(null);
        setErrors(result.errors);
      }
    } catch (e) {
      setMessage(apiMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const open = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const room = await createRoom(source);
      setHostSecret(room.pin, room.hostKey);
      navigate(`/quiz/host/${room.pin}`);
    } catch (e) {
      setMessage(apiMessage(e));
      setBusy(false);
    }
  };

  return (
    <section className="page page--wide quiz-setup" aria-labelledby="page-title">
      <p className="eyebrow">Live quiz · Host</p>
      <h1 id="page-title">Host a live quiz</h1>
      <p className="lede">
        Paste your questions in the import format or upload a <code>.txt</code> file, check them, then open a room.
        Players join at <strong>{window.location.host}/quiz</strong> with the room PIN (up to 250 per room).
      </p>

      {rooms.length > 0 && (
        <div className="notice">
          <h2>Your open rooms</h2>
          <ul className="quiz-rooms">
            {rooms.map((r) => (
              <li key={r.pin}>
                <Link to={`/quiz/host/${r.pin}`} onClick={() => setHostSecret(r.pin, r.hostKey)}>
                  {r.pin} · {r.title}
                </Link>{' '}
                <span className="muted small">
                  ({r.phase}, {r.players} players)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="quiz-setup__tools">
        <button type="button" className="btn btn--small" onClick={loadTemplate}>
          Load the example
        </button>
        <label className="btn btn--small">
          Upload .txt
          <input type="file" accept=".txt,text/plain" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>
      <div className="field">
        <label htmlFor="quiz-source">Questions</label>
        <textarea
          id="quiz-source"
          className="quiz-source"
          rows={16}
          spellCheck={false}
          value={source}
          placeholder={'title: My quiz\n\nQ: Which port does HTTPS use?\n- 80\n* 443'}
          onChange={(e) => {
            setSource(e.target.value);
            setPreview(null);
          }}
        />
      </div>
      <details className="quiz-format">
        <summary>Import format</summary>
        <ul>
          <li>
            <code>title:</code>, <code>time:</code> (seconds, 5–300) and <code>points:</code> at the top set the
            defaults.
          </li>
          <li>
            Each question starts with <code>Q:</code>. Options: <code>* correct</code> and <code>- wrong</code>. One
            correct option makes it single answer, more makes it multiple choice.
          </li>
          <li>
            Typed answers: <code>answer: Paris</code> (case and spaces ignored) or a regular expression{' '}
            <code>answer: /^paris$/i</code>.
          </li>
          <li>
            True/false: <code>type: truefalse</code> and <code>answer: true</code>.
          </li>
          <li>
            Match the following: <code>pair: SSH = 22</code> lines (2–8).
          </li>
          <li>
            Per question: <code>time:</code>, <code>points:</code>, <code>explain:</code>. Lines starting with{' '}
            <code>#</code> are comments.
          </li>
        </ul>
      </details>

      {message && <FormMessage tone="error">{message}</FormMessage>}
      {errors.length > 0 && (
        <div className="form-message form-message--error" role="alert">
          <strong>Fix these first:</strong>
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="actions">
        <button type="button" className="btn" onClick={check} disabled={busy || !source.trim()}>
          Check questions
        </button>
        <button type="button" className="btn btn--primary" onClick={open} disabled={busy || !preview}>
          Open room
        </button>
      </p>

      {preview && (
        <div className="quiz-preview">
          <h2>
            {preview.title} · {preview.questions.length} questions
          </h2>
          <ol>
            {preview.questions.map((q, i) => (
              <li key={i}>
                {q.text}{' '}
                <span className="muted small">
                  ({TYPE_LABELS[q.type]}, {q.timeLimit}s, {q.points} pts)
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
