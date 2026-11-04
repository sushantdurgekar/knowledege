import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { BusyLine, FormMessage } from '../../components/forms';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { isApiProblem } from '../../lib/api';
import {
  apiMessage,
  createRoom,
  getSaved,
  parseQuiz,
  putSaved,
  setHostSecret,
  TYPE_LABELS,
  type Mode,
  type QuestionType,
  type RoomOptions,
  uploadImage,
} from '../../lib/quiz';
import {
  blankItem,
  download,
  fromServer,
  ITEM_TYPES,
  newId,
  retype,
  slugify,
  toServer,
  toText,
  type DocItem,
  type QuizDoc,
} from '../../lib/quiz-doc';
import { AdminGate } from './AdminGate';
import { QuestionImage } from './Answering';
import { HostOptions } from './HostOptions';
import { Sortable } from './Sortable';

/** `/quiz/host/edit/:id`: build a quiz item by item, check it, then host it. */
export function Editor() {
  return (
    <AdminGate>
      <EditorPage />
    </AdminGate>
  );
}

function EditorPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<QuizDoc | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [checked, setChecked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState<Mode | null>(null);
  const [saved, setSaved] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved');
  useDocumentTitle(doc ? `Edit: ${doc.title}` : 'Edit quiz');

  useEffect(() => {
    getSaved(id)
      .then((r) => {
        setDoc(fromServer(r.doc, id));
        setVersion(r.version);
      })
      .catch((e) => setLoadError(isApiProblem(e) && e.status === 404 ? 'not_found' : apiMessage(e)));
  }, [id]);

  const save = async (current: QuizDoc): Promise<boolean> => {
    setSaved('saving');
    try {
      const r = await putSaved(id, toServer(current), version);
      setVersion(r.version);
      setSaved('saved');
      return true;
    } catch (e) {
      setSaved('error');
      setErrors([isApiProblem(e) && e.status === 409 ? `${e.message} (your changes are still here: export them first)` : apiMessage(e)]);
      return false;
    }
  };

  // Autosave a second after the last change.
  useEffect(() => {
    if (!doc || saved !== 'pending') return;
    const timer = setTimeout(() => void save(doc), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, saved]);

  const errorItems = useMemo(() => {
    const out = new Set<number>();
    for (const e of errors) {
      const m = /^item (\d+):/.exec(e);
      if (m) out.add(Number(m[1]) - 1);
    }
    return out;
  }, [errors]);

  if (!doc && !loadError) return <BusyLine>Loading the quiz…</BusyLine>;
  if (!doc && loadError !== 'not_found') return <FormMessage tone="error">{loadError}</FormMessage>;
  if (!doc) {
    return (
      <section className="page" aria-labelledby="page-title">
        <h1 id="page-title">Quiz not found</h1>
        <p className="lede">It isn’t in the library (it may have been deleted).</p>
        <Link className="btn btn--primary" to="/quiz/host">
          Back to the studio
        </Link>
      </section>
    );
  }

  const update = (change: Partial<QuizDoc>) => {
    setDoc((d) => (d ? { ...d, ...change } : d));
    setSaved('pending');
    setChecked(null);
  };
  const setItems = (items: DocItem[]) => update({ items });
  const item = doc.items[Math.min(selected, doc.items.length - 1)];
  const setItem = (next: DocItem) => setItems(doc.items.map((i) => (i.id === next.id ? next : i)));

  const add = (type: QuestionType) => {
    const items = [...doc.items];
    items.splice(selected + 1, 0, blankItem(type));
    setItems(items);
    setSelected(Math.min(selected + 1, items.length - 1));
  };
  const remove = () => {
    if (doc.items.length <= 1) return;
    setItems(doc.items.filter((_, i) => i !== selected));
    setSelected(Math.max(0, selected - 1));
  };
  const duplicate = () => {
    if (!item) return;
    const items = [...doc.items];
    items.splice(selected + 1, 0, { ...structuredClone(item), id: newId() });
    setItems(items);
    setSelected(selected + 1);
  };

  const check = async (): Promise<boolean> => {
    setBusy(true);
    try {
      const result = await parseQuiz({ quiz: toServer(doc) });
      if (result.ok) {
        setErrors([]);
        setChecked(`Ready: ${result.questions.length} items, no problems found.`);
        return true;
      }
      setErrors(result.errors);
      setChecked(null);
      return false;
    } catch (e) {
      setErrors([apiMessage(e)]);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const host = async (options: RoomOptions) => {
    if (!(await check())) return;
    if (saved !== 'saved' && !(await save(doc))) return;
    setBusy(true);
    try {
      const room = await createRoom(toServer(doc), options);
      setHostSecret(room.pin, room.hostKey);
      navigate(`/quiz/host/${room.pin}`);
    } catch (e) {
      setErrors([apiMessage(e)]);
      setBusy(false);
    }
  };

  const labels = doc.items.map((i, n) => `${TYPE_LABELS[i.type]} · ${i.text || '(no text yet)'}${errorItems.has(n) ? ' ⚠' : ''}`);
  const order = doc.items.map((_, i) => i);

  return (
    <section className="page page--wide editor" aria-labelledby="page-title">
      <div className="editor__head">
        <div className="field editor__title">
          <label htmlFor="quiz-title">Quiz title</label>
          <input id="quiz-title" value={doc.title} maxLength={200} onChange={(e) => update({ title: e.target.value })} />
        </div>
        <div className="field editor__num">
          <label htmlFor="quiz-time">Default time (s)</label>
          <input
            id="quiz-time"
            type="number"
            min={5}
            max={300}
            value={doc.time}
            onChange={(e) => update({ time: Number(e.target.value) || 20 })}
          />
        </div>
        <div className="field editor__num">
          <label htmlFor="quiz-points">Default points</label>
          <input
            id="quiz-points"
            type="number"
            min={0}
            max={5000}
            step={100}
            value={doc.points}
            onChange={(e) => update({ points: Number(e.target.value) })}
          />
        </div>
        <label className="studio__check editor__adv" title="Confidence ratings, hints, teach-back and host insights">
          <input type="checkbox" checked={!!doc.advanced} onChange={(e) => update({ advanced: e.target.checked })} /> Advanced
        </label>
        <span className={`muted small editor__saved${saved === 'error' ? ' is-error' : ''}`} role="status">
          {saved === 'saved' ? 'Saved' : saved === 'error' ? 'Not saved' : 'Saving…'}
        </span>
      </div>

      <div className="editor__actions">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => setStarting('live')}>
          Host live
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => setStarting('self')}>
          Self-paced challenge
        </button>
        
        <span className="editor__spacer" />
        <button type="button" className="btn btn--small" disabled={busy} onClick={check}>
          Check
        </button>
        <button type="button" className="btn btn--small btn--quiet" onClick={() => download(`${slugify(doc.title)}.json`, JSON.stringify(toServer(doc), null, 2), 'application/json')}>
          Export .json
        </button>
        <button type="button" className="btn btn--small btn--quiet" onClick={() => download(`${slugify(doc.title)}.txt`, toText(doc), 'text/plain')}>
          Export .txt
        </button>
      </div>

      {starting && (
        <HostOptions
          title={doc.title}
          initialMode={starting}
          busy={busy}
          onCancel={() => setStarting(null)}
          onStart={(options) => {
            setStarting(null);
            void host(options);
          }}
        />
      )}
      {checked && <FormMessage tone="success">{checked}</FormMessage>}
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

      <div className="editor__body">
        <aside className="editor__list" aria-label="Items">
          <h2 className="editor__h">Items ({doc.items.length})</h2>
          <p className="muted small">Drag to reorder. Click to edit.</p>
          <Sortable
            label="Quiz items"
            labels={labels}
            order={order}
            onChange={(next) => {
              const current = doc.items[selected]?.id;
              const items = next.map((i) => doc.items[i]!);
              setItems(items);
              setSelected(Math.max(0, items.findIndex((i) => i.id === current)));
            }}
            rowLabel={(row) => `${row + 1}`}
            onSelect={(chip) => setSelected(chip)}
            selected={selected}
          />
          <h3 className="editor__h editor__h--add">Add after this item</h3>
          <div className="editor__types">
            {ITEM_TYPES.map((t) => (
              <button key={t.type} type="button" className="editor__type" onClick={() => add(t.type)}>
                <strong>{t.label}</strong>
                <span className="muted small">{t.hint}</span>
              </button>
            ))}
          </div>
        </aside>

        {item && (
          <ItemForm
            key={item.id}
            item={item}
            number={selected + 1}
            defaults={{ time: doc.time, points: doc.points }}
            advanced={!!doc.advanced}
            onChange={setItem}
            onDuplicate={duplicate}
            onDelete={doc.items.length > 1 ? remove : undefined}
          />
        )}
      </div>
    </section>
  );
}

function ItemForm({
  item,
  number,
  defaults,
  advanced,
  onChange,
  onDuplicate,
  onDelete,
}: {
  item: DocItem;
  number: number;
  defaults: { time: number; points: number };
  advanced: boolean;
  onChange: (item: DocItem) => void;
  onDuplicate: () => void;
  onDelete?: () => void;
}) {
  const set = (change: Partial<DocItem>) => onChange({ ...item, ...change });
  const slide = item.type === 'slide';
  const options = item.options ?? [];
  const setOption = (i: number, change: Partial<{ text: string; correct: boolean }>) =>
    set({
      options: options.map((o, j) => {
        if (j === i) return { ...o, ...change };
        // Single answer: choosing a correct option clears the others.
        if (change.correct && item.type === 'single') return { ...o, correct: false };
        return o;
      }),
    });

  return (
    <div className="editor__form" aria-label={`Item ${number}`}>
      <div className="editor__form-head">
        <h2 className="editor__h">Item {number}</h2>
        <div className="field editor__kind">
          <label htmlFor="item-type">Type</label>
          <select id="item-type" value={item.type} onChange={(e) => onChange(retype(item, e.target.value as QuestionType))}>
            {ITEM_TYPES.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn--small btn--quiet" onClick={onDuplicate}>
          Duplicate
        </button>
        {onDelete && (
          <button type="button" className="btn btn--small btn--danger" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>

      <div className="field">
        <label htmlFor="item-text">{slide ? 'Slide title' : 'Question'}</label>
        <textarea id="item-text" rows={2} maxLength={1000} value={item.text} onChange={(e) => set({ text: e.target.value })} />
      </div>

      <ImageField image={item.image} onChange={(image) => set({ image })} />

      {slide && (
        <div className="field">
          <label htmlFor="item-body">Slide content</label>
          <textarea
            id="item-body"
            rows={8}
            maxLength={4000}
            value={item.body ?? ''}
            placeholder={'Write what you want to present.\nLeave a blank line between paragraphs; start lines with "- " for bullets.'}
            onChange={(e) => set({ body: e.target.value })}
          />
        </div>
      )}

      {(item.type === 'single' || item.type === 'multi' || item.type === 'poll') && (
        <fieldset className="editor__fieldset">
          <legend>
            Options{' '}
            <span className="muted small">
              {item.type === 'poll'
                ? '(no right answer)'
                : item.type === 'single'
                  ? '(choose the one right answer)'
                  : '(tick every right answer)'}
            </span>
          </legend>
          {options.map((o, i) => (
            <div key={i} className="editor__row">
              {item.type !== 'poll' && (
                <label className="editor__correct">
                  <input
                    type={item.type === 'single' ? 'radio' : 'checkbox'}
                    name={`correct-${item.id}`}
                    checked={o.correct}
                    onChange={(e) => setOption(i, { correct: e.target.checked })}
                  />
                  <span className="sr-only">Option {i + 1} is correct</span>
                </label>
              )}
              <input
                aria-label={`Option ${i + 1}`}
                value={o.text}
                maxLength={200}
                placeholder={`Option ${i + 1}`}
                onChange={(e) => setOption(i, { text: e.target.value })}
              />
              <button
                type="button"
                className="editor__x"
                aria-label={`Remove option ${i + 1}`}
                disabled={options.length <= 2}
                onClick={() => set({ options: options.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          {options.length < 8 && (
            <button type="button" className="btn btn--small btn--quiet" onClick={() => set({ options: [...options, { text: '', correct: false }] })}>
              + Add option
            </button>
          )}
        </fieldset>
      )}

      {item.type === 'truefalse' && (
        <fieldset className="editor__fieldset">
          <legend>The statement is</legend>
          <label className="studio__check">
            <input type="radio" name={`tf-${item.id}`} checked={item.answer !== false} onChange={() => set({ answer: true })} /> True
          </label>{' '}
          <label className="studio__check">
            <input type="radio" name={`tf-${item.id}`} checked={item.answer === false} onChange={() => set({ answer: false })} /> False
          </label>
        </fieldset>
      )}

      {item.type === 'explain' && (
        <fieldset className="editor__fieldset">
          <legend>
            Model answer <span className="muted small">(shown after players send their own explanation; not scored)</span>
          </legend>
          <textarea
            aria-label="Model answer"
            rows={3}
            maxLength={1000}
            value={(item.answers ?? [''])[0] ?? ''}
            onChange={(e) => set({ answers: [e.target.value] })}
          />
        </fieldset>
      )}

      {item.type === 'text' && (
        <fieldset className="editor__fieldset">
          <legend>
            Accepted answers{' '}
            <span className="muted small">(case and extra spaces ignored; write /pattern/i for a regular expression)</span>
          </legend>
          {(item.answers ?? []).map((a, i) => (
            <div key={i} className="editor__row">
              <input
                aria-label={`Accepted answer ${i + 1}`}
                value={a}
                maxLength={200}
                placeholder="Paris  or  /^paris( city)?$/i"
                onChange={(e) => set({ answers: (item.answers ?? []).map((x, j) => (j === i ? e.target.value : x)) })}
              />
              <button
                type="button"
                className="editor__x"
                aria-label={`Remove answer ${i + 1}`}
                disabled={(item.answers ?? []).length <= 1}
                onClick={() => set({ answers: (item.answers ?? []).filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn btn--small btn--quiet" onClick={() => set({ answers: [...(item.answers ?? []), ''] })}>
            + Add accepted answer
          </button>
        </fieldset>
      )}

      {item.type === 'match' && (
        <fieldset className="editor__fieldset">
          <legend>
            Pairs <span className="muted small">(players see the right side shuffled and drag it into place)</span>
          </legend>
          {(item.pairs ?? []).map(([l, r], i) => (
            <div key={i} className="editor__row editor__row--pair">
              <input
                aria-label={`Pair ${i + 1} left`}
                value={l}
                maxLength={200}
                placeholder="Left"
                onChange={(e) => set({ pairs: (item.pairs ?? []).map((p, j) => (j === i ? [e.target.value, p[1]] : p)) })}
              />
              <span aria-hidden="true">↔</span>
              <input
                aria-label={`Pair ${i + 1} right`}
                value={r}
                maxLength={200}
                placeholder="Right"
                onChange={(e) => set({ pairs: (item.pairs ?? []).map((p, j) => (j === i ? [p[0], e.target.value] : p)) })}
              />
              <button
                type="button"
                className="editor__x"
                aria-label={`Remove pair ${i + 1}`}
                disabled={(item.pairs ?? []).length <= 2}
                onClick={() => set({ pairs: (item.pairs ?? []).filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          {(item.pairs ?? []).length < 8 && (
            <button type="button" className="btn btn--small btn--quiet" onClick={() => set({ pairs: [...(item.pairs ?? []), ['', '']] })}>
              + Add pair
            </button>
          )}
        </fieldset>
      )}

      {item.type === 'order' && (
        <fieldset className="editor__fieldset">
          <legend>
            Items in the correct order <span className="muted small">(players see them shuffled)</span>
          </legend>
          {(item.items ?? []).map((v, i) => (
            <div key={i} className="editor__row">
              <span className="editor__n">{i + 1}.</span>
              <input
                aria-label={`Order item ${i + 1}`}
                value={v}
                maxLength={200}
                onChange={(e) => set({ items: (item.items ?? []).map((x, j) => (j === i ? e.target.value : x)) })}
              />
              <button
                type="button"
                className="editor__x"
                aria-label={`Remove item ${i + 1}`}
                disabled={(item.items ?? []).length <= 2}
                onClick={() => set({ items: (item.items ?? []).filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          {(item.items ?? []).length < 8 && (
            <button type="button" className="btn btn--small btn--quiet" onClick={() => set({ items: [...(item.items ?? []), ''] })}>
              + Add item
            </button>
          )}
        </fieldset>
      )}

      {advanced && !['slide', 'poll', 'explain'].includes(item.type) && (
        <fieldset className="editor__fieldset">
          <legend>
            Hints <span className="muted small">(up to 3; each one a player opens costs 25% of the points)</span>
          </legend>
          {(item.hints ?? []).map((h, i) => (
            <div key={i} className="editor__row">
              <input
                aria-label={`Hint ${i + 1}`}
                value={h}
                maxLength={200}
                onChange={(e) => set({ hints: (item.hints ?? []).map((x, j) => (j === i ? e.target.value : x)) })}
              />
              <button
                type="button"
                className="editor__x"
                aria-label={`Remove hint ${i + 1}`}
                onClick={() => set({ hints: (item.hints ?? []).filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
          {(item.hints ?? []).length < 3 && (
            <button type="button" className="btn btn--small btn--quiet" onClick={() => set({ hints: [...(item.hints ?? []), ''] })}>
              + Add hint
            </button>
          )}
        </fieldset>
      )}

      {!slide && (
        <div className="editor__settings">
          <div className="field editor__num">
            <label htmlFor="item-time">Time (s)</label>
            <input
              id="item-time"
              type="number"
              min={5}
              max={300}
              placeholder={String(defaults.time)}
              value={item.time ?? ''}
              onChange={(e) => set({ time: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
          {item.type !== 'poll' && item.type !== 'explain' && (
            <div className="field editor__num">
              <label htmlFor="item-points">Points</label>
              <input
                id="item-points"
                type="number"
                min={0}
                max={5000}
                step={100}
                placeholder={String(defaults.points)}
                value={item.points ?? ''}
                onChange={(e) => set({ points: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </div>
          )}
          <div className="field editor__explain">
            <label htmlFor="item-explain">Explanation (shown after the answer)</label>
            <input id="item-explain" maxLength={1000} value={item.explain ?? ''} onChange={(e) => set({ explain: e.target.value || undefined })} />
          </div>
        </div>
      )}
    </div>
  );
}


/** A picture for the question or slide: shrunk in the browser, then uploaded. */
function ImageField({ image, onChange }: { image?: string; onChange: (image: string | undefined) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="editor__image">
      {image ? (
        <>
          <QuestionImage id={image} alt="Picture attached to this item" />
          <button type="button" className="btn btn--small btn--quiet" onClick={() => onChange(undefined)}>
            Remove picture
          </button>
        </>
      ) : (
        <label className={`btn btn--small${busy ? ' is-busy' : ''}`}>
          {busy ? 'Uploading…' : '+ Add a picture'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setBusy(true);
              setError(null);
              try {
                onChange(await uploadImage(file));
              } catch (err) {
                setError(apiMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      )}
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </div>
  );
}
