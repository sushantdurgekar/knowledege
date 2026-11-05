import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { BusyLine } from '../../components/forms';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { fmtNumber, presenterKey, TYPE_LABELS, useAutoCountdown, useCountdown, useRoomPoll, type RoomView } from '../../lib/quiz';
import {
  cueFor,
  musicPreference,
  play,
  setMusicPreference,
  setSoundPreference,
  soundPreference,
  startMusic,
  stopMusic,
  unlockAudio,
  type RoomSnap,
} from '../../lib/sound';
import { Leaderboard, LETTERS, QuestionImage, SlideBody, Solution, WordCloud } from './Answering';
import { Confetti } from './Confetti';
import { QrCode } from './QrCode';
import { TeamBoard, teamOf } from './Teams';

/**
 * `/quiz/present/:pin#k=<key>`: the screen someone shares in a meeting or on a projector.
 * View-only and full-bleed: it follows the host, shows the PIN to join, the question and
 * timer, the answer counts after the reveal, the leaderboard and the podium. Never an answer
 * before the reveal (the server leaves solutions out).
 */
export function Present() {
  const { pin = '' } = useParams();
  const [key] = useState(() => presenterKey(pin));
  useDocumentTitle(`Presenting ${pin}`);
  if (!key) {
    return (
      <section className="present present--message">
        <h1>Presenter link needed</h1>
        <p>Ask the host for the presenter link of room {pin}.</p>
      </section>
    );
  }
  return <Presenting pin={pin} presentKey={key} />;
}

function Presenting({ pin, presentKey }: { pin: string; presentKey: string }) {
  const { view, fatal, offline } = useRoomPoll(`/api/quiz/rooms/${encodeURIComponent(pin)}/present`, {
    'X-Quiz-Present': presentKey,
  });
  const seconds = useCountdown(view);
  const [full, setFull] = useState(false);
  const [sound, setSound] = useState(soundPreference);
  const [unlocked, setUnlocked] = useState(false);
  const [musicOn, setMusicOn] = useState(musicPreference);
  usePresenterSounds(view, seconds, sound && unlocked);
  const lobby = view?.phase === 'lobby';
  useEffect(() => {
    if (sound && unlocked && musicOn && lobby) startMusic();
    else stopMusic();
  }, [sound, unlocked, musicOn, lobby]);
  useEffect(() => () => stopMusic(), []);

  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Browsers allow audio only after a click or key press on the page.
  useEffect(() => {
    if (unlocked) return;
    const unlock = () => {
      unlockAudio();
      setUnlocked(true);
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, [unlocked]);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    setSoundPreference(next);
    if (next) {
      unlockAudio();
      setUnlocked(true);
    }
  };

  if (fatal) {
    return (
      <section className="present present--message">
        <h1>Room {pin} has ended</h1>
        <p>{fatal}</p>
      </section>
    );
  }
  if (!view) return <BusyLine>Connecting to room {pin}…</BusyLine>;
  const host = window.location.host;

  return (
    <section className="present" aria-label={`Presenter screen for ${view.title}`}>
      <header className="present__bar">
        <span className="present__title">{view.title}</span>
        <span className="present__join">
          Join at <strong>{host}/quiz</strong> · PIN <strong className="mono">{pin}</strong>
        </span>
        <span className="present__tools">
          {offline && <span className="present__offline">Reconnecting…</span>}
          {sound && !unlocked && <span className="present__hint">Click anywhere to allow sound</span>}
          <button type="button" className="present__btn" aria-pressed={sound} onClick={toggleSound}>
            <span aria-hidden="true">{sound ? '🔊' : '🔇'}</span> {sound ? 'Sound on' : 'Sound off'}
          </button>
          {sound && view.phase === 'lobby' && (
            <button
              type="button"
              className="present__btn"
              aria-pressed={musicOn}
              onClick={() => {
                setMusicOn(!musicOn);
                setMusicPreference(!musicOn);
                unlockAudio();
                setUnlocked(true);
              }}
            >
              <span aria-hidden="true">♪</span> {musicOn ? 'Music on' : 'Music off'}
            </button>
          )}
          <button
            type="button"
            className="present__btn"
            onClick={() => (full ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
          >
            {full ? 'Exit full screen' : 'Full screen'}
          </button>
        </span>
      </header>
      <div className="present__stage">
        <Stage view={view} seconds={seconds} pin={pin} host={host} />
      </div>
      {view.reactions && <Reactions list={view.reactions} />}
    </section>
  );
}

function Stage({ view, seconds, pin, host }: { view: RoomView; seconds: number; pin: string; host: string }) {
  if (view.phase === 'lobby') {
    return (
      <div className="present__lobby">
        <div className="present__join-grid">
          <div>
            <p className="present__kicker">Join on your phone</p>
            <p className="present__url">{host}/quiz</p>
            <p className="present__kicker">Game PIN</p>
            <p className="present__pin">{pin}</p>
          </div>
          <div className="present__qr">
            <QrCode text={`${window.location.origin}/quiz?pin=${pin}`} label={`QR code to join room ${pin}`} size={260} />
            <span>Scan to join</span>
          </div>
        </div>
        {view.teams ? <p className="present__kicker">{view.teams} teams</p> : null}
        <p className="present__count">
          <strong>{view.playerCount}</strong> {view.playerCount === 1 ? 'player' : 'players'} in
        </p>
        <ul className="present__chips">
          {(view.players ?? []).slice(0, 120).map((p) => (
            <li key={p.id} style={teamOf(p.team) ? { ['--team' as string]: teamOf(p.team)!.color } : undefined} data-team={p.team ?? undefined}>
              {p.name}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (view.phase === 'finished') {
    const top = (view.leaderboard ?? []).slice(0, 3);
    return (
      <div className="present__final">
        <Confetti />
        <h2 className="present__headline">Final results</h2>
        <ol className="quiz-podium quiz-podium--big">
          {top.map((r) => (
            <li key={r.id} className={`quiz-podium__step quiz-podium__step--${r.rank}`}>
              <span className="quiz-podium__name">{r.name}</span>
              <span className="quiz-podium__score">{r.score.toLocaleString()}</span>
              <span className="quiz-podium__rank">{r.rank}</span>
            </li>
          ))}
        </ol>
        {view.teamBoard && view.teamBoard.length > 0 && <TeamBoard rows={view.teamBoard} big />}
        <Leaderboard rows={(view.leaderboard ?? []).slice(3, 10)} />
      </div>
    );
  }

  if (view.mode === 'self') {
    return (
      <div className="present__split">
        <div>
          <p className="present__kicker">Self-paced quiz</p>
          <h2 className="present__headline">Everyone is answering at their own pace</h2>
          <p className="present__count">
            <strong>{view.doneCount ?? 0}</strong> of {view.playerCount} finished
          </p>
        </div>
        <div>
          {view.teamBoard && view.teamBoard.length > 0 && <TeamBoard rows={view.teamBoard} big />}
          <h2 className="present__sub">Leaderboard</h2>
          <Leaderboard rows={view.leaderboard ?? []} />
        </div>
      </div>
    );
  }

  const q = view.question;
  if (!q) return null;
  if (q.type === 'slide') {
    return (
      <>
        <SlideBody text={q.text} body={q.body} image={q.image} big />
        <AutoNote view={view} />
      </>
    );
  }
  const open = view.phase === 'question';

  return (
    <div className={open ? 'present__question' : 'present__split'}>
      <div>
        <div className="present__meta">
          <span>
            {q.index + 1} / {view.total} · {TYPE_LABELS[q.type]}
          </span>
          {open && q.timeLimit > 0 && (
            <span
              className={`present__timer${seconds <= 5 ? ' is-low' : ''}`}
              style={{ ['--p' as string]: `${(seconds / q.timeLimit) * 100}%` }}
              role="timer"
              aria-label={`${seconds} seconds left`}
            >
              <span key={seconds}>{seconds}</span>
            </span>
          )}
        </div>
        <h2 key={q.index} className="present__q">
          {q.text}
        </h2>
        <QuestionImage id={q.image} big alt={`Picture for the question: ${q.text}`} />
        {open ? (
          <>
            {q.options && (
              <div className="quiz-options quiz-options--static present__options">
                {q.options.map((o, i) => (
                  <div key={i} className={`quiz-option quiz-option--${i % 8}`}>
                    <span className="quiz-option__letter">{LETTERS[i]}</span>
                    {o}
                  </div>
                ))}
              </div>
            )}
            {(q.type === 'match' || q.type === 'order') && (
              <div className="quiz-match-show">
                {q.type === 'match' && (
                  <ol>
                    {(q.left ?? []).map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ol>
                )}
                <ul>
                  {((q.type === 'match' ? q.right : q.items) ?? []).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {q.type === 'text' && <p className="present__sub">Type your answer on your phone</p>}
            {q.type === 'slider' && q.scale && (
              <p className="present__sub">
                Pick a number from {fmtNumber(q.scale.min)} to {fmtNumber(q.scale.max)}
                {q.scale.unit ? ` ${q.scale.unit}` : ''} on your phone
              </p>
            )}
            {q.type === 'cloud' && <WordCloud words={q.stats?.words ?? []} big />}
            {q.type === 'explain' && <p className="present__sub">Explain it in your own words on your phone</p>}
            <p className="present__count">
              <strong>{view.answeredCount ?? 0}</strong> of {view.playerCount} answered
            </p>
          </>
        ) : (
          <>
            {q.type === 'cloud' ? <WordCloud words={q.stats?.words ?? []} big /> : <Solution q={q} />}
            {q.explain && <p className="quiz-explain">{q.explain}</p>}
          </>
        )}
      </div>
      {!open && (
        <div>
          {view.teamBoard && view.teamBoard.length > 0 && <TeamBoard rows={view.teamBoard} big />}
          <h2 className="present__sub">Leaderboard</h2>
          <Leaderboard rows={(view.leaderboard ?? []).slice(0, 8)} />
          <AutoNote view={view} />
        </div>
      )}
    </div>
  );
}

/** "Next in 5 s" while auto-play counts down. */
function AutoNote({ view }: { view: RoomView }) {
  const left = useAutoCountdown(view);
  if (left === null) return null;
  return <p className="present__auto">Next in {left} s</p>;
}

/** Emoji from players float up the screen; each one once. */
function Reactions({ list }: { list: [number, string][] }) {
  // The newest reaction already handled; null until the first view (what was there then stays quiet).
  const seen = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [floating, setFloating] = useState<{ id: number; emoji: string; x: number }[]>([]);
  useEffect(() => {
    const newest = list.length ? list[list.length - 1]![0] : 0;
    const last = seen.current;
    seen.current = Math.max(newest, last ?? 0);
    if (last === null) return;
    const fresh = list.filter(([seq]) => seq > last).slice(-12);
    if (!fresh.length) return;
    setFloating((now) => [...now, ...fresh.map(([id, emoji]) => ({ id, emoji, x: 4 + ((id * 37) % 88) }))].slice(-30));
    const ids = new Set(fresh.map(([id]) => id));
    timers.current.push(setTimeout(() => setFloating((now) => now.filter((f) => !ids.has(f.id))), 3200));
  }, [list]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return (
    <div className="present__reactions" aria-hidden="true">
      {floating.map((f) => (
        <span key={f.id} style={{ left: `${f.x}%` }}>
          {f.emoji}
        </span>
      ))}
    </div>
  );
}

/** Plays the cue for each change in the room (lib/sound.ts cueFor) while sound is on. */
function usePresenterSounds(view: RoomView | null, seconds: number, on: boolean) {
  const prev = useRef<RoomSnap | null>(null);
  const lastPop = useRef(0);
  useEffect(() => {
    if (!view) return;
    const before = prev.current;
    const now: RoomSnap = {
      phase: view.phase,
      self: view.mode === 'self',
      index: view.question?.index,
      players: view.playerCount,
      done: view.doneCount ?? 0,
      seconds,
    };
    prev.current = now;
    if (!on) return;
    const cue = cueFor(before, now);
    if (cue === 'join') {
      // A burst of joins is one pop, not a drum roll.
      const t = performance.now();
      if (t - lastPop.current < 150) return;
      lastPop.current = t;
    }
    if (cue) play(cue);
  }, [view, seconds, on]);
}
