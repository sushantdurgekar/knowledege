// Presenter sounds, synthesised with Web Audio (no audio files to download).
//
// Browsers start an AudioContext suspended until the page gets a click or key press, so the
// context is created lazily and resumed on the first gesture. The mute choice is remembered
// in this browser.

const KEY = 'studyhubs.quiz.sound';

export type Cue = 'join' | 'start' | 'tick' | 'tock' | 'reveal' | 'finale';

/** What the presenter screen knows about the room at one moment. */
export interface RoomSnap {
  phase: string;
  self: boolean;
  index?: number;
  players: number;
  done: number;
  seconds: number;
}

/**
 * The cue for a change on the presenter screen: a pop when someone joins (or finishes, in a
 * self-paced room), a rising pair when a question opens, ticks in the last five seconds, a
 * chord on the reveal and a fanfare at the end. Nothing for the state the screen first loads.
 */
export function cueFor(before: RoomSnap | null, now: RoomSnap): Cue | null {
  if (!before) return null;
  if (now.phase === 'finished') return before.phase === 'finished' ? null : 'finale';
  if (now.phase === 'reveal' && before.phase === 'question') return 'reveal';
  if (now.phase === 'question' && !now.self && (before.phase !== 'question' || before.index !== now.index)) return 'start';
  if (now.players > before.players || now.done > before.done) return 'join';
  if (now.phase === 'question' && !now.self && now.seconds !== before.seconds && now.seconds > 0 && now.seconds <= 5) {
    return now.seconds <= 3 ? 'tock' : 'tick';
  }
  return null;
}

export function soundPreference(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundPreference(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* storage blocked: the choice lasts for this page */
  }
}

type Ctx = AudioContext;
let ctx: Ctx | null = null;

function context(): Ctx | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/** Call from a click or key handler: lets the browser start audio. */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
}

export function audioBlocked(): boolean {
  return !!ctx && ctx.state === 'suspended';
}

/** One soft note: a sine (plus a quiet octave) with a fast attack and an exponential tail. */
function note(c: Ctx, freq: number, at: number, length: number, volume = 0.14, type: OscillatorType = 'sine'): void {
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  gain.connect(c.destination);
  for (const [mult, share] of [
    [1, 1],
    [2, 0.25],
  ] as const) {
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * mult, at);
    const g = c.createGain();
    g.gain.value = share;
    osc.connect(g).connect(gain);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }
}

// Notes (Hz): a C major palette, so every cue sounds like part of the same set.
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;
const A5 = 880;

export function play(cue: Cue): void {
  const c = context();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime + 0.01;
  switch (cue) {
    case 'join':
      note(c, G5, t, 0.12, 0.08, 'triangle');
      note(c, C6, t + 0.05, 0.14, 0.06, 'triangle');
      break;
    case 'start':
      note(c, C5, t, 0.18, 0.1);
      note(c, G5, t + 0.1, 0.3, 0.1);
      break;
    case 'tick':
      note(c, A5, t, 0.08, 0.07, 'square');
      break;
    case 'tock':
      note(c, C6, t, 0.12, 0.09, 'square');
      break;
    case 'reveal':
      note(c, C5, t, 0.5, 0.11);
      note(c, E5, t + 0.08, 0.5, 0.1);
      note(c, G5, t + 0.16, 0.7, 0.1);
      break;
    case 'finale':
      [C5, E5, G5, C6].forEach((f, i) => note(c, f, t + i * 0.13, 0.35, 0.11, 'triangle'));
      [C5, E5, G5, C6].forEach((f) => note(c, f, t + 0.6, 1.4, 0.07));
      break;
  }
}

// -- lobby music: a soft synthesised loop while players join -----------------------------------
const MUSIC_KEY = 'studyhubs.quiz.music';
// Two bars of a C-major pentatonic pattern (Hz), one note per half beat; 0 = rest.
const PATTERN = [523.25, 659.25, 783.99, 659.25, 880, 783.99, 659.25, 0, 587.33, 659.25, 783.99, 1046.5, 880, 783.99, 659.25, 0];
const BASS = [130.81, 130.81, 174.61, 196];
let music: ReturnType<typeof setInterval> | null = null;

export function musicPreference(): boolean {
  try {
    return window.localStorage.getItem(MUSIC_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setMusicPreference(on: boolean): void {
  try {
    window.localStorage.setItem(MUSIC_KEY, on ? 'on' : 'off');
  } catch {
    /* storage blocked */
  }
}

/** Start the lobby loop (no-op if it runs already or audio is not allowed yet). */
export function startMusic(): void {
  if (music) return;
  let step = 0;
  const beat = () => {
    const c = context();
    if (!c || c.state !== 'running') return;
    const t = c.currentTime + 0.02;
    const f = PATTERN[step % PATTERN.length]!;
    if (f) note(c, f, t, 0.32, 0.035, 'triangle');
    if (step % 4 === 0) note(c, BASS[(step / 4) % BASS.length]!, t, 0.9, 0.05, 'sine');
    step += 1;
  };
  beat();
  music = setInterval(beat, 260);
}

export function stopMusic(): void {
  if (music) clearInterval(music);
  music = null;
}