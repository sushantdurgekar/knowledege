import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { FormMessage } from '../../components/forms';
import { useMe } from '../../context/me';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { apiMessage, joinRoom, playerToken, roomInfo, setPlayerToken, suggestNames } from '../../lib/quiz';
import { dueCards, loadState } from '../../lib/quiz-history';
import { WatchForm } from './Board';

/** `/quiz`: enter the room PIN and a nickname. Admins also get a link to host. */
export function JoinPage() {
  useDocumentTitle('Live quiz');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { me } = useMe();
  const [pin, setPin] = useState(params.get('pin') ?? '');
  const [name, setName] = useState(() => {
    try {
      return window.localStorage.getItem('studyhubs.quiz.name') ?? '';
    } catch {
      return '';
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<{ pin: string; title: string; friendly: boolean } | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [spins, setSpins] = useState(0);
  const code = pin.replace(/\D/g, '');

  // Once the PIN is complete, look the room up: its title, and whether it uses generated names.
  useEffect(() => {
    if (code.length !== 6) {
      setRoom(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      roomInfo(code)
        .then((r) => live && setRoom({ pin: code, title: r.title, friendly: r.friendlyNames }))
        .catch(() => live && setRoom(null));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [code]);

  const spin = async () => {
    if (code.length !== 6) return;
    try {
      const { names } = await suggestNames(code);
      setChoices(names);
      setSpins((n) => n + 1);
      return names;
    } catch (e) {
      setError(apiMessage(e));
      return [];
    }
  };

  // Generated names only: offer three right away.
  useEffect(() => {
    if (room?.friendly && room.pin === code) {
      setName('');
      setSpins(0);
      void spin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.friendly, room?.pin]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (code.length !== 6) return setError('The PIN has 6 digits.');
    if (room?.friendly && !choices.includes(name)) return setError('Pick one of the names above.');
    if (playerToken(code)) return navigate(`/quiz/play/${code}`); // already in this room
    setBusy(true);
    setError(null);
    try {
      const joined = await joinRoom(code, name);
      setPlayerToken(code, joined.token);
      try {
        window.localStorage.setItem('studyhubs.quiz.name', joined.name);
      } catch {
        /* ignore */
      }
      navigate(`/quiz/play/${code}`);
    } catch (e) {
      setError(apiMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const admin = me.status === 'signed-in' && me.user.admin;
  const deck = loadState();
  const due = dueCards(deck).length;
  const cards = Object.keys(deck.deck).length;
  return (
    <section className="page quiz-join" aria-labelledby="page-title">
      <p className="eyebrow">Live quiz</p>
      <h1 id="page-title">Join a live quiz</h1>
      <p className="lede">Enter the PIN on the host’s screen and pick a nickname. No account needed.</p>
      <form className="quiz-join__form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="quiz-pin">Game PIN</label>
          <input
            id="quiz-pin"
            className="quiz-pin-input"
            inputMode="numeric"
            autoComplete="off"
            maxLength={7}
            placeholder="123456"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            required
          />
        </div>
        {room && <p className="quiz-join__room">Joining “{room.title}”</p>}
        {room?.friendly ? (
          <fieldset className="quiz-names">
            <legend>Pick your name</legend>
            <p className="muted small">This room uses generated names, so everyone gets a friendly one.</p>
            <div className="quiz-names__choices" role="radiogroup" aria-label="Name suggestions">
              {choices.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  role="radio"
                  aria-checked={name === choice}
                  className={`quiz-names__choice${name === choice ? ' is-on' : ''}`}
                  onClick={() => setName(choice)}
                >
                  {choice}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn--small btn--quiet" disabled={spins >= 3} onClick={() => void spin()}>
              🎲 {spins >= 3 ? 'No more spins' : `Spin again (${3 - spins} left)`}
            </button>
          </fieldset>
        ) : (
          <div className="field">
            <label htmlFor="quiz-name">Nickname</label>
            <div className="quiz-join__name">
              <input
                id="quiz-name"
                maxLength={24}
                autoComplete="nickname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <button
                type="button"
                className="btn btn--small btn--quiet"
                disabled={code.length !== 6}
                title="Suggest a friendly name"
                onClick={async () => {
                  const names = await spin();
                  if (names?.[0]) setName(names[0]);
                }}
              >
                🎲 Suggest
              </button>
            </div>
          </div>
        )}
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <button className="btn btn--primary btn--wide" type="submit" disabled={busy}>
          {busy ? 'Joining…' : 'Join'}
        </button>
      </form>
      <WatchForm />
      {cards > 0 && (
        <div className="notice quiz-review-cta">
          <h2>Your review deck</h2>
          <p>
            {due ? `${due} card(s) due now` : 'Nothing due right now'} · {cards} cards from your quizzes.
          </p>
          <p className="actions">
            <Link className="btn" to="/quiz/review">
              {due ? 'Review now' : 'Open the deck'}
            </Link>
            <Link className="btn btn--quiet" to="/quiz/progress">
              My progress
            </Link>
          </p>
        </div>
      )}
      {admin && (
        <div className="notice quiz-host-cta">
          <h2>Hosting?</h2>
          <p>Build quizzes and lessons in the studio, then run them live or self-paced.</p>
          <Link className="btn" to="/quiz/host">
            Open the quiz studio
          </Link>
        </div>
      )}
    </section>
  );
}
