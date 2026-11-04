import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { FormMessage } from '../../components/forms';
import { useMe } from '../../context/me';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { apiMessage, joinRoom, playerToken, setPlayerToken } from '../../lib/quiz';
import { dueCards, loadState } from '../../lib/quiz-history';

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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const code = pin.replace(/\D/g, '');
    if (code.length !== 6) return setError('The PIN has 6 digits.');
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
        <div className="field">
          <label htmlFor="quiz-name">Nickname</label>
          <input
            id="quiz-name"
            maxLength={24}
            autoComplete="nickname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <button className="btn btn--primary btn--wide" type="submit" disabled={busy}>
          {busy ? 'Joining…' : 'Join'}
        </button>
      </form>
      {cards > 0 && (
        <div className="notice quiz-review-cta">
          <h2>Your review deck</h2>
          <p>
            {due ? `${due} card(s) due now` : 'Nothing due right now'} · {cards} cards from your quizzes.
          </p>
          <Link className="btn" to="/quiz/review">
            {due ? 'Review now' : 'Open the deck'}
          </Link>
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
