import { useEffect, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { BusyLine, FormMessage } from '../../components/forms';
import { apiMessage, draftQuestions, listBank, type BankHub, type DraftKind, type DraftResult } from '../../lib/quiz';

const KINDS: { kind: DraftKind; label: string }[] = [
  { kind: 'single', label: 'Single choice' },
  { kind: 'multi', label: 'Multiple choice' },
  { kind: 'truefalse', label: 'True / false' },
  { kind: 'text', label: 'Type the answer' },
];
const MAX_NOTES = 30_000;

/**
 * Draft questions with the Claude API from a hub's key points or pasted notes. The drafts are
 * added to the quiz for the admin to review and edit; nothing is hosted from here.
 */
export function AiDraft({
  advanced,
  avoid,
  onAdd,
  onCancel,
}: {
  advanced: boolean;
  /** Questions already in the quiz, so the drafts don't repeat them. */
  avoid: string[];
  onAdd: (result: DraftResult) => void;
  onCancel: () => void;
}) {
  const [source, setSource] = useState<'hub' | 'notes'>('hub');
  const [hubs, setHubs] = useState<BankHub[] | null>(null);
  const [hubId, setHubId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [count, setCount] = useState(8);
  const [kinds, setKinds] = useState<DraftKind[]>(['single', 'multi', 'truefalse']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBank()
      .then((r) => setHubs(r.hubs.filter((h) => h.modules.some((m) => m.keys > 0))))
      .catch((e) => setError(apiMessage(e)));
  }, []);

  const hub = hubs?.find((h) => h.id === hubId);
  const ready = kinds.length > 0 && (source === 'hub' ? picked.length > 0 : notes.trim().length >= 40);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await draftQuestions({
        ...(source === 'hub' ? { hubId, moduleIds: picked } : { notes: notes.trim() }),
        count,
        kinds,
        advanced,
        avoid,
      });
      if (result.items.length === 0) {
        setError('The draft came back empty. Try other modules or more detailed notes.');
        setBusy(false);
        return;
      }
      onAdd(result);
    } catch (e) {
      setError(apiMessage(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Draft questions with AI"
      onCancel={busy ? undefined : onCancel}
      actions={
        <>
          <button type="button" className="btn btn--primary" disabled={busy || !ready} onClick={run}>
            {busy ? 'Drafting…' : `Draft ${count} question${count === 1 ? '' : 's'}`}
          </button>
          <button type="button" className="btn btn--quiet" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </>
      }
    >
      <p className="muted small">
        Claude writes draft questions from your material. They are added after the current item for you to check and edit:
        nothing is hosted until you do. Each draft costs a few cents of API usage.
      </p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <fieldset className="host-options__group" disabled={busy}>
        <legend>Draft from</legend>
        <label className="host-options__choice">
          <input type="radio" name="ai-source" checked={source === 'hub'} onChange={() => setSource('hub')} />
          <span>
            <strong>A study hub</strong>
            <span className="muted small">The key points of the modules you pick.</span>
          </span>
        </label>
        <label className="host-options__choice">
          <input type="radio" name="ai-source" checked={source === 'notes'} onChange={() => setSource('notes')} />
          <span>
            <strong>My notes</strong>
            <span className="muted small">Paste a lesson, an article or your own notes.</span>
          </span>
        </label>
      </fieldset>

      {source === 'hub' ? (
        !hubs ? (
          !error && <BusyLine>Loading the hubs…</BusyLine>
        ) : hubs.length === 0 ? (
          <p className="muted">No hub has key points to draft from yet. Paste notes instead.</p>
        ) : (
          <>
            <div className="field">
              <label htmlFor="ai-hub">Hub</label>
              <select
                id="ai-hub"
                value={hubId}
                disabled={busy}
                onChange={(e) => {
                  setHubId(e.target.value);
                  setPicked([]);
                }}
              >
                <option value="">Choose a hub…</option>
                {hubs.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.title}
                  </option>
                ))}
              </select>
            </div>
            {hub && (
              <fieldset className="editor__fieldset ai-draft__modules" disabled={busy}>
                <legend>Modules</legend>
                <ul className="bank__modules">
                  {hub.modules
                    .filter((m) => m.keys > 0)
                    .map((m) => (
                      <li key={m.id}>
                        <label className="studio__check">
                          <input
                            type="checkbox"
                            checked={picked.includes(m.id)}
                            onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.id] : p.filter((x) => x !== m.id)))}
                          />{' '}
                          {m.title} <span className="muted small">({m.keys} key points)</span>
                        </label>
                      </li>
                    ))}
                </ul>
              </fieldset>
            )}
          </>
        )
      ) : (
        <div className="field">
          <label htmlFor="ai-notes">Notes</label>
          <textarea
            id="ai-notes"
            rows={8}
            value={notes}
            maxLength={MAX_NOTES}
            disabled={busy}
            placeholder="Paste at least a paragraph of material."
            onChange={(e) => setNotes(e.target.value)}
          />
          <span className="muted small">
            {notes.length.toLocaleString()} / {MAX_NOTES.toLocaleString()} characters
          </span>
        </div>
      )}

      <div className="ai-draft__row">
        <div className="field editor__num">
          <label htmlFor="ai-count">How many</label>
          <input
            id="ai-count"
            type="number"
            min={1}
            max={15}
            value={count}
            disabled={busy}
            onChange={(e) => setCount(Math.min(15, Math.max(1, Number(e.target.value) || 1)))}
          />
        </div>
        <fieldset className="ai-draft__kinds" disabled={busy}>
          <legend>Question types</legend>
          {KINDS.map((k) => (
            <label key={k.kind} className="studio__check">
              <input
                type="checkbox"
                checked={kinds.includes(k.kind)}
                onChange={(e) => setKinds((all) => (e.target.checked ? [...all, k.kind] : all.filter((x) => x !== k.kind)))}
              />{' '}
              {k.label}
            </label>
          ))}
        </fieldset>
      </div>
      {advanced && <p className="muted small">Advanced quiz: each draft also gets a hint.</p>}
      {busy && <BusyLine>Drafting… this usually takes 30 to 90 seconds.</BusyLine>}
    </Dialog>
  );
}
