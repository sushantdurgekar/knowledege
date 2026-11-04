import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BusyLine, FormMessage } from '../../components/forms';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { apiResponse, isApiProblem } from '../../lib/api';
import {
  apiMessage,
  createRoom,
  deleteSaved,
  getBankHub,
  getSaved,
  listBank,
  listLibrary,
  listRooms,
  parseQuiz,
  putSaved,
  setHostSecret,
  type BankHub,
  type LibraryEntry,
  type Mode,
  type OpenRoom,
  type RoomOptions,
} from '../../lib/quiz';
import {
  blankDoc,
  download,
  forgetLocalDoc,
  fromBank,
  fromServer,
  loadLocalLibrary,
  slugify,
  toServer,
  toText,
  type QuizDoc,
} from '../../lib/quiz-doc';
import { AdminGate } from './AdminGate';
import { HostOptions } from './HostOptions';

/** `/quiz/host`: the shared quiz library (saved on the server), open rooms and new quizzes. */
export function Library() {
  return (
    <AdminGate>
      <LibraryPage />
    </AdminGate>
  );
}

type Message = { tone: 'error' | 'success'; text: string } | null;

function LibraryPage() {
  useDocumentTitle('Quiz studio');
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<LibraryEntry[] | null>(null);
  const [rooms, setRooms] = useState<OpenRoom[]>([]);
  const [local, setLocal] = useState<QuizDoc[]>(() => loadLocalLibrary());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [starting, setStarting] = useState<{ entry: LibraryEntry; mode: Mode } | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listLibrary()
      .then((r) => setQuizzes(r.quizzes))
      .catch((e) => {
        setQuizzes([]);
        setMessage({ tone: 'error', text: apiMessage(e) });
      });
  }, []);

  useEffect(() => {
    refresh();
    listRooms()
      .then((r) => setRooms(r.rooms))
      .catch(() => setRooms([]));
  }, [refresh]);

  /** Save a new quiz on the server, then open it in the editor. */
  const createFrom = async (doc: QuizDoc) => {
    await putSaved(doc.id, toServer(doc), null);
    navigate(`/quiz/host/edit/${doc.id}`);
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } catch (e) {
      const text =
        e instanceof SyntaxError ? 'That file is not valid JSON' : isApiProblem(e) ? e.message : e instanceof Error ? e.message : apiMessage(e);
      setMessage({ tone: 'error', text });
    } finally {
      setBusy(false);
    }
  };

  const importText = (text: string, name: string) =>
    run(async () => {
      const input = name.endsWith('.json') || text.trimStart().startsWith('{') ? { quiz: JSON.parse(text) as unknown } : { source: text };
      const result = await parseQuiz(input);
      if (!result.ok) throw new Error(`Could not import ${name}: ${result.errors.slice(0, 3).join('; ')}`);
      await createFrom(fromServer(result.quiz));
    });

  const fromExample = (advanced: boolean) =>
    run(async () => {
      const response = await apiResponse(`/api/quiz/template${advanced ? '?advanced=1' : ''}`, { headers: { Accept: 'text/plain' } });
      const result = await parseQuiz({ source: await response.text() });
      if (result.ok) await createFrom(fromServer(result.quiz));
    });

  const host = (entry: LibraryEntry, options: RoomOptions) =>
    run(async () => {
      const { doc } = await getSaved(entry.id);
      const room = await createRoom(doc, options);
      setHostSecret(room.pin, room.hostKey);
      navigate(`/quiz/host/${room.pin}`);
    });

  const exportAs = (entry: LibraryEntry, kind: 'json' | 'txt') =>
    run(async () => {
      const { doc } = await getSaved(entry.id);
      const name = slugify(entry.title);
      if (kind === 'json') download(`${name}.json`, JSON.stringify(doc, null, 2), 'application/json');
      else download(`${name}.txt`, toText(fromServer(doc)), 'text/plain');
    });

  const duplicate = (entry: LibraryEntry) =>
    run(async () => {
      const { doc } = await getSaved(entry.id);
      const copy = fromServer(doc);
      copy.title = `${entry.title} (copy)`.slice(0, 200);
      await putSaved(copy.id, toServer(copy), null);
      refresh();
    });

  const remove = (entry: LibraryEntry) => {
    if (!window.confirm(`Delete “${entry.title}” for every admin?`)) return;
    void run(async () => {
      await deleteSaved(entry.id);
      refresh();
    });
  };

  const uploadLocal = () =>
    run(async () => {
      for (const doc of local) {
        await putSaved(doc.id, toServer(doc), null).catch(async () => putSaved(blankDoc().id, toServer(doc), null));
        forgetLocalDoc(doc.id);
      }
      setLocal(loadLocalLibrary());
      setMessage({ tone: 'success', text: 'Uploaded the quizzes from this browser to the shared library.' });
      refresh();
    });

  return (
    <section className="page page--wide studio" aria-labelledby="page-title">
      <p className="eyebrow">Admin · Quiz studio</p>
      <h1 id="page-title">Quiz studio</h1>
      <p className="lede">
        Build quizzes and lessons, then run them live (you set the pace) or self-paced with flashcards. Players join at{' '}
        <strong>{window.location.host}/quiz</strong> with the room PIN (up to 250 per room).
      </p>

      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}

      {local.length > 0 && (
        <div className="notice">
          <h2>{local.length} quiz(zes) only in this browser</h2>
          <p>They were made before quizzes were saved on the server. Upload them so every admin and device has them.</p>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={uploadLocal}>
            Upload to the shared library
          </button>
        </div>
      )}

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

      <div className="studio__new">
        <button type="button" className="studio__new-card" disabled={busy} onClick={() => run(() => createFrom(blankDoc(false)))}>
          <strong>New quick quiz</strong>
          <span className="muted small">Questions, polls and slides. Fast to make.</span>
        </button>
        <button type="button" className="studio__new-card" disabled={busy} onClick={() => run(() => createFrom(blankDoc(true)))}>
          <strong>New advanced quiz</strong>
          <span className="muted small">Adds confidence ratings, hints, teach-back and insights.</span>
        </button>
        <button type="button" className="studio__new-card" disabled={busy} onClick={() => setBankOpen((o) => !o)}>
          <strong>From a study hub</strong>
          <span className="muted small">Turn a hub’s key points and practice questions into a quiz.</span>
        </button>
      </div>
      <div className="studio__toolbar">
        <button type="button" className="btn btn--small" disabled={busy} onClick={() => file.current?.click()}>
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
        <button type="button" className="btn btn--small btn--quiet" disabled={busy} onClick={() => fromExample(false)}>
          Quick example
        </button>
        <button type="button" className="btn btn--small btn--quiet" disabled={busy} onClick={() => fromExample(true)}>
          Advanced example
        </button>
      </div>

      {bankOpen && <BankPicker busy={busy} onCreate={(doc) => run(() => createFrom(doc))} />}

      {quizzes === null ? (
        <BusyLine>Loading the library…</BusyLine>
      ) : quizzes.length === 0 ? (
        <div className="notice">
          <h2>No quizzes yet</h2>
          <p>Create one, import a file, start from an example, or build one from a study hub.</p>
        </div>
      ) : (
        <ul className="studio__grid">
          {quizzes.map((q) => (
            <li key={q.id} className="studio__card">
              <h3 className="studio__card-title">
                <Link to={`/quiz/host/edit/${q.id}`}>{q.title || 'Untitled quiz'}</Link>
                {q.advanced && <span className="quiz-tag">Advanced</span>}
              </h3>
              <p className="muted small">
                {q.questions} question{q.questions === 1 ? '' : 's'}
                {q.items > q.questions ? ` · ${q.items - q.questions} slide(s)` : ''} · {new Date(q.updated).toLocaleDateString()}
                {q.by ? ` · ${q.by}` : ''}
              </p>
              <div className="studio__card-actions">
                <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={() => setStarting({ entry: q, mode: 'live' })}>
                  Host live
                </button>
                <button type="button" className="btn btn--small" disabled={busy} onClick={() => setStarting({ entry: q, mode: 'self' })}>
                  Self-paced challenge
                </button>
              </div>
              <div className="studio__card-more">
                <Link to={`/quiz/host/edit/${q.id}`}>Edit</Link>
                <button type="button" className="link-button" onClick={() => duplicate(q)}>
                  Duplicate
                </button>
                <button type="button" className="link-button" onClick={() => exportAs(q, 'json')}>
                  .json
                </button>
                <button type="button" className="link-button" onClick={() => exportAs(q, 'txt')}>
                  .txt
                </button>
                <button type="button" className="link-button link-button--danger" onClick={() => remove(q)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {starting && (
        <HostOptions
          title={starting.entry.title}
          initialMode={starting.mode}
          busy={busy}
          onCancel={() => setStarting(null)}
          onStart={(options) => {
            const entry = starting.entry;
            setStarting(null);
            void host(entry, options);
          }}
        />
      )}
      <p className="muted small">
        Quizzes are saved on the server and shared by every admin. Export a copy (.json or .txt) any time.
      </p>
    </section>
  );
}

/** Pick a hub and modules from the question bank, then build a quiz from them. */
function BankPicker({ busy, onCreate }: { busy: boolean; onCreate: (doc: QuizDoc) => void }) {
  const [hubs, setHubs] = useState<BankHub[] | null>(null);
  const [hubId, setHubId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [slides, setSlides] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBank()
      .then((r) => setHubs(r.hubs))
      .catch((e) => setError(apiMessage(e)));
  }, []);

  const hub = hubs?.find((h) => h.id === hubId);
  const build = async () => {
    try {
      const full = await getBankHub(hubId);
      const modules = full.modules.filter((m) => picked.includes(m.id));
      onCreate(fromBank(full.title, modules, { slides, advanced }));
    } catch (e) {
      setError(apiMessage(e));
    }
  };

  return (
    <section className="bank" aria-labelledby="bank-title">
      <h2 id="bank-title">Build a quiz from a study hub</h2>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {!hubs ? (
        <BusyLine>Loading the hubs…</BusyLine>
      ) : hubs.length === 0 ? (
        <p className="muted">No hub has practice questions yet.</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor="bank-hub">Hub</label>
            <select
              id="bank-hub"
              value={hubId}
              onChange={(e) => {
                setHubId(e.target.value);
                setPicked([]);
              }}
            >
              <option value="">Choose a hub…</option>
              {hubs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.title} ({h.modules.reduce((n, m) => n + m.questions, 0)} questions)
                </option>
              ))}
            </select>
          </div>
          {hub && (
            <fieldset className="editor__fieldset">
              <legend>
                Modules{' '}
                <button type="button" className="link-button small" onClick={() => setPicked(hub.modules.map((m) => m.id))}>
                  select all
                </button>
              </legend>
              <ul className="bank__modules">
                {hub.modules.map((m) => (
                  <li key={m.id}>
                    <label className="studio__check">
                      <input
                        type="checkbox"
                        checked={picked.includes(m.id)}
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.id] : p.filter((x) => x !== m.id)))}
                      />{' '}
                      {m.title} <span className="muted small">({m.questions} questions)</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
          <p className="studio__card-actions">
            <label className="studio__check">
              <input type="checkbox" checked={slides} onChange={(e) => setSlides(e.target.checked)} /> key points as slides first
            </label>
            <label className="studio__check">
              <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} /> advanced quiz
            </label>
            <button type="button" className="btn btn--primary" disabled={busy || !picked.length} onClick={build}>
              Create quiz
            </button>
          </p>
        </>
      )}
    </section>
  );
}
